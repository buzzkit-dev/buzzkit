import { env } from 'cloudflare:workers';
import type { SubscriberActor } from '@buzzkit/api/actor/subscriber';
import {
  dueInstants,
  nextScheduleInstant,
  timezoneScoped,
  zonesFor,
} from '@buzzkit/api/api/scheduling/index';
import { findSegmentBySlug, listSegmentMembers } from '@buzzkit/api/api/segments/index';
import { BadRequestError, NotFoundError } from '@buzzkit/api/libs/error';
import { encodeId } from '@buzzkit/api/libs/sqids';
import { currentTraceparent, trace } from '@buzzkit/api/libs/telemetry';
import { and, asc, type Db, desc, eq, gt, isNull, sql, tables } from '@buzzkit/database';
import {
  DEFAULT_TIMEZONE,
  type ScheduleTrigger,
  SUBSCRIBER_TIMEZONE,
  type WorkflowSpec,
} from '@buzzkit/schema/workflows';
import { getAgentByName } from 'agents';
import type { Expression } from 'buzzkit/expressions';
import {
  SCHEDULE_DRAIN_ROUNDS,
  SCHEDULE_LOOKBACK_MS,
  SCHEDULE_MAX_FIRES_PER_TICK,
  SCHEDULE_MEMBER_PAGE,
  SCHEDULE_MEMBERS_PER_TICK,
  SCHEDULE_NEXT_FIRES,
  SCHEDULE_OPEN_FIRES_PER_ROUND,
  SCHEDULE_START_CONCURRENCY,
} from './constants';
import type { Workflow, WorkflowDefinition, WorkflowVersion } from './types';

export type ScheduleFire = typeof tables.workflowSchedule.$inferSelect;

export type ScheduleMember = { subscriberId: number; externalId: string };

type MemberPage = { items: ScheduleMember[]; hasMore: boolean; nextCursor: number | null };

type ScheduledWorkflow = { workflow: Workflow; version: WorkflowVersion; trigger: ScheduleTrigger };

export function scheduleTriggerOf(spec: WorkflowSpec): ScheduleTrigger | null {
  return 'schedule' in spec.trigger ? spec.trigger : null;
}

export function nextFires(trigger: ScheduleTrigger, now: Date, limit = SCHEDULE_NEXT_FIRES) {
  return zonesFor(trigger.timezone)
    .flatMap((zone) => {
      const at = nextScheduleInstant(trigger.schedule, now, zone);
      return at ? [{ zone, at }] : [];
    })
    .sort((left, right) => left.at.getTime() - right.at.getTime() || left.zone.localeCompare(right.zone))
    .slice(0, limit);
}

export async function assertScheduleSegment(db: Db, tenantId: number, spec: WorkflowSpec): Promise<void> {
  const trigger = scheduleTriggerOf(spec);
  if (!trigger?.segment) return;
  try {
    await findSegmentBySlug(db, tenantId, trigger.segment);
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
    throw new BadRequestError(`Segment '${trigger.segment}' does not exist`, {
      code: 'segment_not_found',
      param: 'spec.trigger.segment',
    });
  }
}

async function listScheduledWorkflows(db: Db): Promise<ScheduledWorkflow[]> {
  const rows = await db
    .select({ workflow: tables.workflow, version: tables.workflowVersion })
    .from(tables.workflow)
    .innerJoin(tables.workflowVersion, eq(tables.workflowVersion.id, tables.workflow.currentVersionId))
    .where(
      and(
        eq(tables.workflow.status, 'active'),
        isNull(tables.workflow.deletedAt),
        sql`jsonb_exists(${tables.workflowVersion.spec} -> 'trigger', 'schedule')`
      )
    )
    .orderBy(tables.workflow.id);
  return rows.flatMap(({ workflow, version }) => {
    const trigger = scheduleTriggerOf(version.spec as WorkflowSpec);
    return trigger ? [{ workflow, version, trigger }] : [];
  });
}

export async function recordDueFires(db: Db, now: Date): Promise<number> {
  let recorded = 0;
  for (const { workflow, version, trigger } of await listScheduledWorkflows(db)) {
    const values = zonesFor(trigger.timezone).flatMap((zone) =>
      dueInstants(trigger.schedule, zone, now, SCHEDULE_LOOKBACK_MS, SCHEDULE_MAX_FIRES_PER_TICK).map(
        (fireAt) => ({
          tenantId: workflow.tenantId,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          fireAt,
          zone,
        })
      )
    );
    if (values.length === 0) continue;
    const inserted = await db
      .insert(tables.workflowSchedule)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: tables.workflowSchedule.id });
    recorded += inserted.length;
  }
  return recorded;
}

function zoneClause(zone: string, fallback: string) {
  const attribute = sql`${tables.subscriber.attributes} ->> '$timezone'`;
  return zone === fallback
    ? sql`(${attribute} = ${zone} or ${attribute} is null)`
    : sql`${attribute} = ${zone}`;
}

async function listMembers(
  db: Db,
  tenantId: number,
  trigger: ScheduleTrigger,
  fallback: string,
  zone: string,
  afterId: number,
  limit: number
): Promise<MemberPage> {
  const zoned = trigger.timezone === SUBSCRIBER_TIMEZONE;
  if (trigger.segment) {
    const segment = await findSegmentBySlug(db, tenantId, trigger.segment);
    const audience = segment.version.expression as Expression;
    const expression = zoned ? timezoneScoped(audience, [zone], fallback) : audience;
    const page = await listSegmentMembers(tenantId, expression, { afterSubscriberId: afterId, limit });
    return {
      items: page.items.map((item) => ({ subscriberId: item.subscriber_id, externalId: item.external_id })),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    };
  }
  const rows = await db
    .select({ id: tables.subscriber.id, externalId: tables.subscriber.externalId })
    .from(tables.subscriber)
    .where(
      and(
        eq(tables.subscriber.tenantId, tenantId),
        isNull(tables.subscriber.deletedAt),
        gt(tables.subscriber.id, afterId),
        ...(zoned ? [zoneClause(zone, fallback)] : [])
      )
    )
    .orderBy(asc(tables.subscriber.id))
    .limit(limit + 1);
  const items = rows.slice(0, limit).map((row) => ({ subscriberId: row.id, externalId: row.externalId }));
  const hasMore = rows.length > limit;
  return { items, hasMore, nextCursor: hasMore ? (items[items.length - 1]?.subscriberId ?? null) : null };
}

async function startRun(
  fire: ScheduleFire,
  definition: WorkflowDefinition,
  member: ScheduleMember
): Promise<string> {
  const actor = await getAgentByName<Env, SubscriberActor>(
    env.SUBSCRIBER_ACTOR,
    `${fire.tenantId}:${member.subscriberId}`
  );
  return await actor.startScheduledRun({
    tenantId: fire.tenantId,
    subscriberId: member.subscriberId,
    externalId: member.externalId,
    definition,
    fire: { at: fire.fireAt.toISOString(), zone: fire.zone },
    traceparent: currentTraceparent(),
  });
}

async function drainFire(
  db: Db,
  fire: ScheduleFire,
  scheduled: ScheduledWorkflow,
  now: Date,
  budget: number
): Promise<{ started: number; finished: boolean }> {
  const { workflow, version, trigger } = scheduled;
  const definition: WorkflowDefinition = {
    id: encodeId('workflow', workflow.id),
    slug: workflow.slug,
    status: 'active',
    versionId: encodeId('workflowVersion', version.id),
    spec: version.spec as WorkflowSpec,
  };
  const fallback = (version.spec as WorkflowSpec).defaultTimezone ?? DEFAULT_TIMEZONE;
  let cursor = fire.memberCursor;
  let started = 0;
  let finished = false;
  while (started < budget) {
    const page = await listMembers(
      db,
      fire.tenantId,
      trigger,
      fallback,
      fire.zone,
      cursor,
      Math.min(SCHEDULE_MEMBER_PAGE, budget - started)
    );
    for (let index = 0; index < page.items.length; index += SCHEDULE_START_CONCURRENCY) {
      const chunk = page.items.slice(index, index + SCHEDULE_START_CONCURRENCY);
      const outcomes = await Promise.all(chunk.map((member) => startRun(fire, definition, member)));
      started += outcomes.filter((outcome) => outcome === 'started').length;
    }
    const nextCursor = page.nextCursor ?? page.items[page.items.length - 1]?.subscriberId ?? cursor;
    finished = !page.hasMore;
    const claimed = await db
      .update(tables.workflowSchedule)
      .set({
        memberCursor: nextCursor,
        started: sql`${tables.workflowSchedule.started} + ${started}`,
        ...(finished ? { finishedAt: now } : {}),
        updatedAt: now,
      })
      .where(and(eq(tables.workflowSchedule.id, fire.id), eq(tables.workflowSchedule.memberCursor, cursor)))
      .returning({ id: tables.workflowSchedule.id });
    if (claimed.length === 0) return { started, finished: false };
    cursor = nextCursor;
    if (finished) break;
  }
  return { started, finished };
}

async function listOpenFires(db: Db, afterId: number): Promise<ScheduleFire[]> {
  return await db
    .select()
    .from(tables.workflowSchedule)
    .where(
      and(
        isNull(tables.workflowSchedule.finishedAt),
        isNull(tables.workflowSchedule.deletedAt),
        gt(tables.workflowSchedule.id, afterId)
      )
    )
    .orderBy(asc(tables.workflowSchedule.id))
    .limit(SCHEDULE_OPEN_FIRES_PER_ROUND);
}

export async function drainOpenFires(db: Db, now: Date): Promise<{ started: number; finished: number }> {
  let started = 0;
  let finished = 0;
  let afterId = 0;
  let scheduled: Map<number, ScheduledWorkflow> | null = null;
  for (let round = 0; round < SCHEDULE_DRAIN_ROUNDS && started < SCHEDULE_MEMBERS_PER_TICK; round += 1) {
    const open = await listOpenFires(db, afterId);
    if (open.length === 0) break;
    scheduled ??= new Map(
      (await listScheduledWorkflows(db)).map((entry) => [entry.version.id, entry] as const)
    );
    for (const fire of open) {
      afterId = fire.id;
      const entry = scheduled.get(fire.workflowVersionId);
      if (!entry) {
        await db
          .update(tables.workflowSchedule)
          .set({ finishedAt: now, updatedAt: now })
          .where(eq(tables.workflowSchedule.id, fire.id));
        finished += 1;
        continue;
      }
      const outcome = await drainFire(db, fire, entry, now, SCHEDULE_MEMBERS_PER_TICK - started);
      started += outcome.started;
      if (outcome.finished) finished += 1;
      if (started >= SCHEDULE_MEMBERS_PER_TICK) break;
    }
    if (open.length < SCHEDULE_OPEN_FIRES_PER_ROUND) break;
  }
  return { started, finished };
}

export async function releaseDueSchedules(db: Db, now: Date) {
  return await trace('workflows.schedules', async (t) => {
    const recorded = await recordDueFires(db, now);
    const drained = await drainOpenFires(db, now);
    t.set('schedules.recorded', recorded);
    t.set('schedules.started', drained.started);
    t.set('schedules.finished', drained.finished);
    return { recorded, ...drained };
  });
}

export async function listFires(db: Db, workflowId: number, limit = 20) {
  return await db
    .select({
      fireAt: tables.workflowSchedule.fireAt,
      version: tables.workflowVersion.version,
      zones: sql<
        string[] | string
      >`json_agg(${tables.workflowSchedule.zone} order by ${tables.workflowSchedule.zone})`,
      started: sql<number>`sum(${tables.workflowSchedule.started})::int`,
      finishedAt: sql<
        Date | string | null
      >`case when count(*) = count(${tables.workflowSchedule.finishedAt}) then max(${tables.workflowSchedule.finishedAt}) end`,
    })
    .from(tables.workflowSchedule)
    .innerJoin(
      tables.workflowVersion,
      eq(tables.workflowVersion.id, tables.workflowSchedule.workflowVersionId)
    )
    .where(and(eq(tables.workflowSchedule.workflowId, workflowId), isNull(tables.workflowSchedule.deletedAt)))
    .groupBy(tables.workflowSchedule.fireAt, tables.workflowVersion.version)
    .orderBy(desc(tables.workflowSchedule.fireAt), desc(tables.workflowVersion.version))
    .limit(limit);
}

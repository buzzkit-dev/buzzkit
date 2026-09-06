import type { PagePromise } from '../core/pagination';
import type { Transport } from '../core/transport';
import type { CredentialsResource } from '../resources/credentials';
import { credentialsResource } from '../resources/credentials';
import type { DeliveriesResource } from '../resources/deliveries';
import { deliveriesResource } from '../resources/deliveries';
import type { EventInput, EventsResource, TrackedEvent } from '../resources/events';
import { eventsResource } from '../resources/events';
import type { ImportsResource } from '../resources/imports';
import { importsResource } from '../resources/imports';
import type { LiveActivitiesResource } from '../resources/liveActivities';
import { liveActivitiesResource } from '../resources/liveActivities';
import type { Message, MessagesResource, SendMessageParams } from '../resources/messages';
import { messagesResource } from '../resources/messages';
import type { RunsResource } from '../resources/runs';
import { runsResource } from '../resources/runs';
import type { SecretsResource } from '../resources/secrets';
import { secretsResource } from '../resources/secrets';
import type { SegmentsResource } from '../resources/segments';
import { segmentsResource } from '../resources/segments';
import type { SourcesResource } from '../resources/sources';
import { sourcesResource } from '../resources/sources';
import type { StatsResource } from '../resources/stats';
import { statsResource } from '../resources/stats';
import type { Subscriber, SubscribersResource, UpsertSubscriberParams } from '../resources/subscribers';
import { subscribersResource } from '../resources/subscribers';
import type { SubscriptionsResource } from '../resources/subscriptions';
import { subscriptionsResource } from '../resources/subscriptions';
import type { TopicCategoriesResource, TopicsResource } from '../resources/topics';
import { topicCategoriesResource, topicsResource } from '../resources/topics';
import type { WebhooksResource } from '../resources/webhooks';
import { webhooksResource } from '../resources/webhooks';
import type { WorkflowsResource } from '../resources/workflows';
import { workflowsResource } from '../resources/workflows';
import type {
  AuditResource,
  MembersResource,
  UpdateWorkspaceParams,
  Workspace,
  WorkspacesResource,
} from '../resources/workspaces';
import { auditResource, membersResource, workspacesResource } from '../resources/workspaces';
import { SubscriberScope } from './subscriber';

export class TenantScope {
  readonly messages: MessagesResource;
  readonly subscribers: SubscribersResource;
  readonly subscriptions: SubscriptionsResource;
  readonly topics: TopicsResource;
  readonly topicCategories: TopicCategoriesResource;
  readonly segments: SegmentsResource;
  readonly workflows: WorkflowsResource;
  readonly runs: RunsResource;
  readonly events: EventsResource;
  readonly deliveries: DeliveriesResource;
  readonly credentials: CredentialsResource;
  readonly secrets: SecretsResource;
  readonly sources: SourcesResource;
  readonly imports: ImportsResource;
  readonly liveActivities: LiveActivitiesResource;
  readonly stats: StatsResource;

  protected readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
    this.messages = messagesResource(transport);
    this.subscribers = subscribersResource(transport);
    this.subscriptions = subscriptionsResource(transport);
    this.topics = topicsResource(transport);
    this.topicCategories = topicCategoriesResource(transport);
    this.segments = segmentsResource(transport);
    this.workflows = workflowsResource(transport);
    this.runs = runsResource(transport);
    this.events = eventsResource(transport);
    this.deliveries = deliveriesResource(transport);
    this.credentials = credentialsResource(transport);
    this.secrets = secretsResource(transport);
    this.sources = sourcesResource(transport);
    this.imports = importsResource(transport);
    this.liveActivities = liveActivitiesResource(transport);
    this.stats = statsResource(transport);
  }

  send(params: SendMessageParams): Promise<Message> {
    return this.messages.send(params);
  }

  track(events: EventInput | EventInput[]): PagePromise<TrackedEvent> {
    return this.events.track(events);
  }

  subscriber(externalId: string): SubscriberScope {
    return new SubscriberScope(this.scopeResources(), externalId, null);
  }

  identify(externalId: string, params: UpsertSubscriberParams = {}): Promise<SubscriberScope<Subscriber>> {
    return this.subscriber(externalId).identify(params);
  }

  private scopeResources() {
    return {
      subscribers: this.subscribers,
      subscriptions: this.subscriptions,
      messages: this.messages,
      events: this.events,
    };
  }
}

export class WorkspaceScope {
  readonly webhooks: WebhooksResource;
  readonly members: MembersResource;
  readonly audit: AuditResource;

  private readonly workspaces: WorkspacesResource;
  private readonly slug: string;

  constructor(transport: Transport, slug: string) {
    this.slug = slug;
    this.workspaces = workspacesResource(transport);
    this.webhooks = webhooksResource(transport, slug);
    this.members = membersResource(transport, slug);
    this.audit = auditResource(transport, slug);
  }

  retrieve(): Promise<Workspace> {
    return this.workspaces.retrieve(this.slug);
  }

  update(params: UpdateWorkspaceParams): Promise<Workspace> {
    return this.workspaces.update(this.slug, params);
  }
}

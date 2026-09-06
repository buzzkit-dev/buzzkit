import { ConfigurationError } from '../core/errors';
import type {
  Page as CorePage,
  PageParams as CorePageParams,
  PagePromise as CorePagePromise,
} from '../core/pagination';
import type { Expression as SegmentExpression } from '../expressions/index';
import type * as R from '../resources/index';
import type { TenantsResource, WorkspacesResource } from '../resources/index';
import { tenantsResource } from '../resources/tenants';
import { workspacesResource } from '../resources/workspaces';
import type { ClientOptions, ResolvedOptions } from './options';
import { resolveOptions, serverTransport } from './options';
import { TenantScope, WorkspaceScope } from './scopes';

type ClientHealth = {
  status: string;
  database: { status: string; latencyMs: number };
};

export class BuzzKit extends TenantScope {
  readonly tenants: TenantsResource;
  readonly workspaces: WorkspacesResource;

  private readonly options: ResolvedOptions;

  constructor(options: ClientOptions = {}) {
    const resolved = resolveOptions(options);
    super(serverTransport(resolved));
    this.options = resolved;
    this.tenants = tenantsResource(this.transport);
    this.workspaces = workspacesResource(this.transport);
  }

  tenant(slug: string): TenantScope {
    return new TenantScope(this.transport.with({ 'buzzkit-tenant': slug }));
  }

  workspace(slug?: string): WorkspaceScope {
    const resolved = slug ?? this.options.workspace;
    if (!resolved) {
      throw new ConfigurationError(
        'No workspace selected — call buzzkit.workspace(slug) or pass { workspace } to the client'
      );
    }

    return new WorkspaceScope(this.transport.with({ 'buzzkit-workspace': resolved }), resolved);
  }

  health(): Promise<ClientHealth> {
    return this.transport.request({ method: 'GET', path: '/v1/health' });
  }
}

export namespace BuzzKit {
  export type Options = ClientOptions;
  export type Expression = SegmentExpression;
  export type Health = ClientHealth;
  export type KeyKind = R.KeyKind;
  export type Page<T> = CorePage<T>;
  export type PageParams = CorePageParams;
  export type PagePromise<T> = CorePagePromise<T>;
  export type AliasSource = R.AliasSource;
  export type ApnsCredentialParams = R.ApnsCredentialParams;
  export type ActorType = R.ActorType;
  export type Attributes = R.Attributes;
  export type AuditActorType = R.AuditActorType;
  export type AuditEvent = R.AuditEvent;
  export type Channel = R.Channel;
  export type ChannelDefaults = R.ChannelDefaults;
  export type ChannelPreference = R.ChannelPreference;
  export type CreateCredentialParams = R.CreateCredentialParams;
  export type CreateSegmentParams = R.CreateSegmentParams;
  export type CreateSourceParams = R.CreateSourceParams;
  export type CreateSubscriptionParams = R.CreateSubscriptionParams;
  export type CreateTenantParams = R.CreateTenantParams;
  export type CreateTopicParams = R.CreateTopicParams;
  export type CreateWebhookParams = R.CreateWebhookParams;
  export type CreateWorkflowParams = R.CreateWorkflowParams;
  export type CreateWorkspaceParams = R.CreateWorkspaceParams;
  export type Credential = R.Credential;
  export type CredentialStatus = R.CredentialStatus;
  export type Deleted<T> = R.Deleted<T>;
  export type Delivery = R.Delivery;
  export type DeliveryAttempt = R.DeliveryAttempt;
  export type DeliveryAttemptOutcome = R.DeliveryAttemptOutcome;
  export type DeliveryStatus = R.DeliveryStatus;
  export type DeliveryTotals = R.DeliveryTotals;
  export type Environment = R.Environment;
  export type EventInput = R.EventInput;
  export type EventName = R.EventName;
  export type EventNameDetail = R.EventNameDetail;
  export type EventRecord = R.EventRecord;
  export type EventSource = R.EventSource;
  export type EventVolume = R.EventVolume;
  export type EventVolumeBucket = R.EventVolumeBucket;
  export type EventVolumeRange = R.EventVolumeRange;
  export type FcmCredentialParams = R.FcmCredentialParams;
  export type ImportFailure = R.ImportFailure;
  export type ImportResult = R.ImportResult;
  export type ImportRow = R.ImportRow;
  export type InterruptionLevel = R.InterruptionLevel;
  export type ListAuditParams = R.ListAuditParams;
  export type ListEventsParams = R.ListEventsParams;
  export type ListMessageDeliveriesParams = R.ListMessageDeliveriesParams;
  export type ListMessagesParams = R.ListMessagesParams;
  export type ListRunsParams = R.ListRunsParams;
  export type ListSourceDeliveriesParams = R.ListSourceDeliveriesParams;
  export type ListSubscribersParams = R.ListSubscribersParams;
  export type ListWebhookDeliveriesParams = R.ListWebhookDeliveriesParams;
  export type ListWorkflowRunsParams = R.ListWorkflowRunsParams;
  export type LiveActivityAlert = R.LiveActivityAlert;
  export type LiveActivityEvent = R.LiveActivityEvent;
  export type LiveActivityResult = R.LiveActivityResult;
  export type MemberRole = R.MemberRole;
  export type Message = R.Message;
  export type MessageAction = R.MessageAction;
  export type MessageCounts = R.MessageCounts;
  export type MessageDelivery = R.MessageDelivery;
  export type MessagePayload = R.MessagePayload;
  export type MessagePriority = R.MessagePriority;
  export type MessageSchedule = R.MessageSchedule;
  export type MessageScheduleInput = R.MessageScheduleInput;
  export type MessageStatus = R.MessageStatus;
  export type MessageTargets = R.MessageTargets;
  export type Metadata = R.Metadata;
  export type Platform = R.Platform;
  export type PreferenceChanges = R.PreferenceChanges;
  export type Provider = R.Provider;
  export type QuietHours = R.QuietHours;
  export type ResendCredentialParams = R.ResendCredentialParams;
  export type Run = R.Run;
  export type RunCounts = R.RunCounts;
  export type RunDetail = R.RunDetail;
  export type RunStatus = R.RunStatus;
  export type RunTotals = R.RunTotals;
  export type Secret = R.Secret;
  export type Segment = R.Segment;
  export type SegmentPreview = R.SegmentPreview;
  export type SegmentVersion = R.SegmentVersion;
  export type SendLiveActivityParams = R.SendLiveActivityParams;
  export type SendMessageParams = R.SendMessageParams;
  export type SendPolicy = R.SendPolicy;
  export type Source = R.Source;
  export type SourceDelivery = R.SourceDelivery;
  export type SourceDeliveryOutcome = R.SourceDeliveryOutcome;
  export type SourceMapping = R.SourceMapping;
  export type SourcePreset = R.SourcePreset;
  export type SourcePreview = R.SourcePreview;
  export type SourcePreviewParams = R.SourcePreviewParams;
  export type SourceProvider = R.SourceProvider;
  export type SourceStatus = R.SourceStatus;
  export type SourceVerification = R.SourceVerification;
  export type Stats = R.Stats;
  export type StatsDay = R.StatsDay;
  export type StatsInterval = R.StatsInterval;
  export type StatsParams = R.StatsParams;
  export type StatsWindow = R.StatsWindow;
  export type StatsWorkflow = R.StatsWorkflow;
  export type Subscriber = R.Subscriber;
  export type SubscriberAlias = R.SubscriberAlias;
  export type SubscriberDelivery = R.SubscriberDelivery;
  export type SubscriberListItem = R.SubscriberListItem;
  export type SubscriberPreference = R.SubscriberPreference;
  export type SubscriberTimelineParams = R.SubscriberTimelineParams;
  export type SubscriberWithSubscriptions = R.SubscriberWithSubscriptions;
  export type RegisteredSubscription = R.RegisteredSubscription;
  export type Subscription = R.Subscription;
  export type SubscriptionStatus = R.SubscriptionStatus;
  export type Tenant = R.Tenant;
  export type TenantSettings = R.TenantSettings;
  export type TenantSettingsPatch = R.TenantSettingsPatch;
  export type TestWorkflowParams = R.TestWorkflowParams;
  export type Topic = R.Topic;
  export type TopicCategory = R.TopicCategory;
  export type TrackedEvent = R.TrackedEvent;
  export type UpdateSegmentParams = R.UpdateSegmentParams;
  export type UpdateSourceParams = R.UpdateSourceParams;
  export type UpdateTenantParams = R.UpdateTenantParams;
  export type UpdateTopicParams = R.UpdateTopicParams;
  export type UpdateWebhookParams = R.UpdateWebhookParams;
  export type UpdateWorkflowParams = R.UpdateWorkflowParams;
  export type UpdateWorkspaceParams = R.UpdateWorkspaceParams;
  export type UpsertSubscriberParams = R.UpsertSubscriberParams;
  export type WebhookAttempt = R.WebhookAttempt;
  export type WebhookCatalogGroup = R.WebhookCatalogGroup;
  export type WebhookDelivery = R.WebhookDelivery;
  export type WebhookDeliveryDetail = R.WebhookDeliveryDetail;
  export type WebhookDeliveryStatus = R.WebhookDeliveryStatus;
  export type WebhookEndpoint = R.WebhookEndpoint;
  export type WebhookEndpointWithSecret = R.WebhookEndpointWithSecret;
  export type WebhookEvent = R.WebhookEvent;
  export type Workflow = R.Workflow;
  export type WorkflowSchedule = R.WorkflowSchedule;
  export type WorkflowScheduleFire = R.WorkflowScheduleFire;
  export type WorkflowSpec = R.WorkflowSpec;
  export type WorkflowStatus = R.WorkflowStatus;
  export type WorkflowStepTrace = R.WorkflowStepTrace;
  export type WorkflowTestResult = R.WorkflowTestResult;
  export type WorkflowVersion = R.WorkflowVersion;
  export type Workspace = R.Workspace;
  export type WorkspaceMember = R.WorkspaceMember;
}

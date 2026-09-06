import type { serializeAuditEvent } from '@buzzkit/api/api/audit/index';
import type { CredentialUploadSchema, serializeCredential } from '@buzzkit/api/api/credentials/index';
import type {
  ListMessageDeliveriesQuerySchema,
  serializeAttempt,
  serializeDelivery,
  serializeMessageDelivery,
  serializeSubscriberDelivery,
} from '@buzzkit/api/api/deliveries/index';
import type {
  EventRecord as ApiEventRecord,
  TrackedEvent as ApiTrackedEvent,
  ListEventsQuerySchema,
  serializeEventName,
  TrackEventSchema,
} from '@buzzkit/api/api/events/index';
import type { ImportResult as ApiImportResult, ImportBodySchema } from '@buzzkit/api/api/imports/index';
import type { SendLiveActivitySchema } from '@buzzkit/api/api/live-activities/index';
import type { serializeMember } from '@buzzkit/api/api/members/index';
import type {
  CreateMessageSchema,
  ListMessagesQuerySchema,
  serializeMessage,
} from '@buzzkit/api/api/messages/index';
import type {
  RunCounts as ApiRunCounts,
  RunDetail as ApiRunDetail,
  RunRecord as ApiRunRecord,
  ListRunsQuerySchema,
  ListWorkflowRunsQuerySchema,
} from '@buzzkit/api/api/runs/index';
import type { serializeSecret } from '@buzzkit/api/api/secrets/index';
import type {
  CreateSegmentSchema,
  serializeSegment,
  UpdateSegmentSchema,
} from '@buzzkit/api/api/segments/index';
import type {
  CreateSourceSchema,
  ListSourceDeliveriesQuerySchema,
  serializeSource,
  serializeSourceDelivery,
  UpdateSourceSchema,
} from '@buzzkit/api/api/sources/index';
import type { Stats as ApiStats } from '@buzzkit/api/api/stats/index';
import type {
  ListSubscribersQuerySchema,
  SubscriptionInputSchema,
  serializeSubscriber,
  serializeSubscriberAlias,
  serializeSubscriberListItem,
  serializeSubscription,
} from '@buzzkit/api/api/subscribers/index';
import type { TenantSettings as ApiTenantSettings, serializeTenant } from '@buzzkit/api/api/tenants/index';
import type {
  SubscriberPreference as ApiSubscriberPreference,
  serializeTopic,
  serializeTopicCategory,
} from '@buzzkit/api/api/topics/index';
import type {
  ListWebhookDeliveriesQuerySchema,
  serializeEndpoint,
  serializeWebhookAttempt,
  serializeWebhookDelivery,
  serializeWebhookEvent,
} from '@buzzkit/api/api/webhooks/index';
import type {
  CreateWorkflowSchema,
  serializeVersion,
  serializeWorkflow,
  UpdateWorkflowSchema,
} from '@buzzkit/api/api/workflows/index';
import type { serializeWorkspace } from '@buzzkit/api/api/workspaces/index';
import type { BuzzKit } from 'buzzkit';
import type { Expect, Matches } from './wire';

type MessageParity = Expect<Matches<BuzzKit.Message, ReturnType<typeof serializeMessage>>>;
type SendParity = Expect<Matches<BuzzKit.SendMessageParams, typeof CreateMessageSchema.static>>;
type ListMessagesQuery = Expect<Matches<BuzzKit.ListMessagesParams, typeof ListMessagesQuerySchema.static>>;
type ListMessageDeliveriesQuery = Expect<
  Matches<BuzzKit.ListMessageDeliveriesParams, typeof ListMessageDeliveriesQuerySchema.static>
>;
type ListSubscribersQuery = Expect<
  Matches<BuzzKit.ListSubscribersParams, typeof ListSubscribersQuerySchema.static>
>;
type ListEventsQuery = Expect<Matches<BuzzKit.ListEventsParams, typeof ListEventsQuerySchema.static>>;
type ListRunsQuery = Expect<Matches<BuzzKit.ListRunsParams, typeof ListRunsQuerySchema.static>>;
type ListWorkflowRunsQuery = Expect<
  Matches<BuzzKit.ListWorkflowRunsParams, typeof ListWorkflowRunsQuerySchema.static>
>;
type ListSourceDeliveriesQuery = Expect<
  Matches<BuzzKit.ListSourceDeliveriesParams, typeof ListSourceDeliveriesQuerySchema.static>
>;
type ListWebhookDeliveriesQuery = Expect<
  Matches<BuzzKit.ListWebhookDeliveriesParams, typeof ListWebhookDeliveriesQuerySchema.static>
>;
type CreateSegmentRequest = Expect<Matches<BuzzKit.CreateSegmentParams, typeof CreateSegmentSchema.static>>;
type UpdateSegmentRequest = Expect<Matches<BuzzKit.UpdateSegmentParams, typeof UpdateSegmentSchema.static>>;
type CreateSourceRequest = Expect<Matches<BuzzKit.CreateSourceParams, typeof CreateSourceSchema.static>>;
type UpdateSourceRequest = Expect<Matches<BuzzKit.UpdateSourceParams, typeof UpdateSourceSchema.static>>;
type CreateWorkflowRequest = Expect<
  Matches<BuzzKit.CreateWorkflowParams, typeof CreateWorkflowSchema.static>
>;
type UpdateWorkflowRequest = Expect<
  Matches<BuzzKit.UpdateWorkflowParams, typeof UpdateWorkflowSchema.static>
>;
type ImportRequest = Expect<Matches<{ rows: BuzzKit.ImportRow[] }, typeof ImportBodySchema.static>>;
type LiveActivityRequest = Expect<
  Matches<BuzzKit.SendLiveActivityParams, typeof SendLiveActivitySchema.static>
>;
type TrackEventRequest = Expect<Matches<BuzzKit.EventInput, typeof TrackEventSchema.static>>;
type CredentialRequest = Expect<
  Matches<BuzzKit.CreateCredentialParams, typeof CredentialUploadSchema.static>
>;
type SubscriptionRequest = Expect<
  Matches<Omit<BuzzKit.CreateSubscriptionParams, 'externalId'>, typeof SubscriptionInputSchema.static>
>;

type DeliveryParity = Expect<Matches<BuzzKit.Delivery, ReturnType<typeof serializeDelivery>>>;
type AttemptParity = Expect<Matches<BuzzKit.DeliveryAttempt, ReturnType<typeof serializeAttempt>>>;
type MessageDeliveryParity = Expect<
  Matches<BuzzKit.MessageDelivery, ReturnType<typeof serializeMessageDelivery>>
>;
type SubscriberDeliveryParity = Expect<
  Matches<BuzzKit.SubscriberDelivery, ReturnType<typeof serializeSubscriberDelivery>>
>;

type SubscriberParity = Expect<Matches<BuzzKit.Subscriber, ReturnType<typeof serializeSubscriber>>>;
type SubscriberAliasParity = Expect<
  Matches<BuzzKit.SubscriberAlias, ReturnType<typeof serializeSubscriberAlias>>
>;
type SubscriberListParity = Expect<
  Matches<BuzzKit.SubscriberListItem, ReturnType<typeof serializeSubscriberListItem>>
>;
type SubscriptionParity = Expect<Matches<BuzzKit.Subscription, ReturnType<typeof serializeSubscription>>>;

type TopicParity = Expect<Matches<BuzzKit.Topic, ReturnType<typeof serializeTopic>>>;
type TopicCategoryParity = Expect<Matches<BuzzKit.TopicCategory, ReturnType<typeof serializeTopicCategory>>>;
type PreferenceParity = Expect<Matches<BuzzKit.SubscriberPreference, ApiSubscriberPreference>>;

type SegmentParity = Expect<Matches<BuzzKit.Segment, ReturnType<typeof serializeSegment>>>;

type ApiWorkflow = ReturnType<typeof serializeWorkflow>;
type OpaqueWorkflowKeys = 'spec' | 'trigger' | 'versions';
type WorkflowParity = Expect<
  Matches<Omit<BuzzKit.Workflow, OpaqueWorkflowKeys>, Omit<ApiWorkflow, OpaqueWorkflowKeys>>
>;
type WorkflowSpecParity = Expect<Matches<BuzzKit.WorkflowSpec, ApiWorkflow['spec']>>;
type WorkflowTriggerParity = Expect<Matches<BuzzKit.Workflow['trigger'], ApiWorkflow['trigger']>>;
type WorkflowVersionParity = Expect<Matches<BuzzKit.WorkflowVersion, ReturnType<typeof serializeVersion>>>;

type RunParity = Expect<Matches<BuzzKit.Run, ApiRunRecord>>;
type RunDetailParity = Expect<Matches<BuzzKit.RunDetail, ApiRunDetail>>;
type RunCountsParity = Expect<Matches<BuzzKit.RunCounts, ApiRunCounts>>;

type EventParity = Expect<Matches<BuzzKit.EventRecord, ApiEventRecord>>;
type TrackedParity = Expect<Matches<BuzzKit.TrackedEvent, ApiTrackedEvent>>;
type EventNameParity = Expect<Matches<BuzzKit.EventName, ReturnType<typeof serializeEventName>>>;

type CredentialParity = Expect<Matches<BuzzKit.Credential, ReturnType<typeof serializeCredential>>>;
type SecretParity = Expect<Matches<BuzzKit.Secret, ReturnType<typeof serializeSecret>>>;
type ApiSource = ReturnType<typeof serializeSource>;
type OpaqueSourceKeys = 'mapping' | 'verification';
type SourceParity = Expect<
  Matches<Omit<BuzzKit.Source, OpaqueSourceKeys>, Omit<ApiSource, OpaqueSourceKeys>>
>;
type SourceMappingParity = Expect<Matches<BuzzKit.SourceMapping, ApiSource['mapping']>>;
type SourceVerificationParity = Expect<Matches<BuzzKit.SourceVerification, ApiSource['verification']>>;
type SourceDeliveryParity = Expect<
  Matches<BuzzKit.SourceDelivery, ReturnType<typeof serializeSourceDelivery>>
>;

type TenantParity = Expect<Matches<BuzzKit.Tenant, ReturnType<typeof serializeTenant>>>;
type TenantSettingsParity = Expect<Matches<BuzzKit.TenantSettings, ApiTenantSettings>>;
type StatsParity = Expect<Matches<BuzzKit.Stats, ApiStats>>;
type ImportParity = Expect<Matches<BuzzKit.ImportResult, ApiImportResult>>;

type WorkspaceParity = Expect<Matches<BuzzKit.Workspace, ReturnType<typeof serializeWorkspace>>>;
type MemberParity = Expect<Matches<BuzzKit.WorkspaceMember, ReturnType<typeof serializeMember>>>;
type AuditParity = Expect<Matches<BuzzKit.AuditEvent, ReturnType<typeof serializeAuditEvent>>>;

type WebhookParity = Expect<Matches<BuzzKit.WebhookEndpoint, ReturnType<typeof serializeEndpoint>>>;
type WebhookEventParity = Expect<Matches<BuzzKit.WebhookEvent, ReturnType<typeof serializeWebhookEvent>>>;
type WebhookDeliveryParity = Expect<
  Matches<BuzzKit.WebhookDelivery, ReturnType<typeof serializeWebhookDelivery>>
>;
type WebhookAttemptParity = Expect<
  Matches<BuzzKit.WebhookAttempt, ReturnType<typeof serializeWebhookAttempt>>
>;

export type ContractParity = [
  MessageParity,
  SendParity,
  ListMessagesQuery,
  ListMessageDeliveriesQuery,
  ListSubscribersQuery,
  ListEventsQuery,
  ListRunsQuery,
  ListWorkflowRunsQuery,
  ListSourceDeliveriesQuery,
  ListWebhookDeliveriesQuery,
  CreateSegmentRequest,
  UpdateSegmentRequest,
  CreateSourceRequest,
  UpdateSourceRequest,
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  ImportRequest,
  LiveActivityRequest,
  TrackEventRequest,
  CredentialRequest,
  SubscriptionRequest,
  DeliveryParity,
  AttemptParity,
  MessageDeliveryParity,
  SubscriberDeliveryParity,
  SubscriberAliasParity,
  SubscriberParity,
  SubscriberListParity,
  SubscriptionParity,
  TopicParity,
  TopicCategoryParity,
  PreferenceParity,
  SegmentParity,
  WorkflowParity,
  WorkflowSpecParity,
  WorkflowTriggerParity,
  WorkflowVersionParity,
  RunParity,
  RunDetailParity,
  RunCountsParity,
  EventParity,
  TrackedParity,
  EventNameParity,
  CredentialParity,
  SecretParity,
  SourceParity,
  SourceMappingParity,
  SourceVerificationParity,
  SourceDeliveryParity,
  TenantParity,
  TenantSettingsParity,
  StatsParity,
  ImportParity,
  WorkspaceParity,
  MemberParity,
  AuditParity,
  WebhookParity,
  WebhookEventParity,
  WebhookDeliveryParity,
  WebhookAttemptParity,
];

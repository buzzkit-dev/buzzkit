import type { serializeAuditEvent } from '@buzzkit/api/api/audit/index';
import type { serializeCredential } from '@buzzkit/api/api/credentials/index';
import type {
  serializeAttempt,
  serializeDelivery,
  serializeMessageDelivery,
  serializeSubscriberDelivery,
} from '@buzzkit/api/api/deliveries/index';
import type {
  EventRecord as ApiEventRecord,
  TrackedEvent as ApiTrackedEvent,
  serializeEventName,
} from '@buzzkit/api/api/events/index';
import type { ImportResult as ApiImportResult } from '@buzzkit/api/api/imports/index';
import type { serializeMember } from '@buzzkit/api/api/members/index';
import type { CreateMessageSchema, serializeMessage } from '@buzzkit/api/api/messages/index';
import type {
  RunCounts as ApiRunCounts,
  RunDetail as ApiRunDetail,
  RunRecord as ApiRunRecord,
} from '@buzzkit/api/api/runs/index';
import type { serializeSecret } from '@buzzkit/api/api/secrets/index';
import type { serializeSegment } from '@buzzkit/api/api/segments/index';
import type { serializeSource, serializeSourceDelivery } from '@buzzkit/api/api/sources/index';
import type { Stats as ApiStats } from '@buzzkit/api/api/stats/index';
import type {
  serializeSubscriber,
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
  serializeEndpoint,
  serializeWebhookAttempt,
  serializeWebhookDelivery,
  serializeWebhookEvent,
} from '@buzzkit/api/api/webhooks/index';
import type { serializeVersion, serializeWorkflow } from '@buzzkit/api/api/workflows/index';
import type { serializeWorkspace } from '@buzzkit/api/api/workspaces/index';
import type { Buzzkit } from 'buzzkit';
import type { Accepts, Expect, Matches } from './wire';

type MessageParity = Expect<Matches<Buzzkit.Message, ReturnType<typeof serializeMessage>>>;
type SendParity = Expect<Matches<Buzzkit.SendMessageParams, typeof CreateMessageSchema.static>>;

type DeliveryParity = Expect<Matches<Buzzkit.Delivery, ReturnType<typeof serializeDelivery>>>;
type AttemptParity = Expect<Matches<Buzzkit.DeliveryAttempt, ReturnType<typeof serializeAttempt>>>;
type MessageDeliveryParity = Expect<
  Matches<Buzzkit.MessageDelivery, ReturnType<typeof serializeMessageDelivery>>
>;
type SubscriberDeliveryParity = Expect<
  Matches<Buzzkit.SubscriberDelivery, ReturnType<typeof serializeSubscriberDelivery>>
>;

type SubscriberParity = Expect<Matches<Buzzkit.Subscriber, ReturnType<typeof serializeSubscriber>>>;
type SubscriberListParity = Expect<
  Matches<Buzzkit.SubscriberListItem, ReturnType<typeof serializeSubscriberListItem>>
>;
type SubscriptionParity = Expect<Matches<Buzzkit.Subscription, ReturnType<typeof serializeSubscription>>>;

type TopicParity = Expect<Matches<Buzzkit.Topic, ReturnType<typeof serializeTopic>>>;
type TopicCategoryParity = Expect<Matches<Buzzkit.TopicCategory, ReturnType<typeof serializeTopicCategory>>>;
type PreferenceParity = Expect<Matches<Buzzkit.SubscriberPreference, ApiSubscriberPreference>>;

type SegmentParity = Expect<Matches<Buzzkit.Segment, ReturnType<typeof serializeSegment>>>;

type ApiWorkflow = ReturnType<typeof serializeWorkflow>;
type OpaqueWorkflowKeys = 'spec' | 'trigger' | 'versions';
type WorkflowParity = Expect<
  Matches<Omit<Buzzkit.Workflow, OpaqueWorkflowKeys>, Omit<ApiWorkflow, OpaqueWorkflowKeys>>
>;
type WorkflowSpecParity = Expect<Accepts<Buzzkit.WorkflowSpec, ApiWorkflow['spec']>>;
type WorkflowTriggerParity = Expect<Accepts<Buzzkit.Workflow['trigger'], ApiWorkflow['trigger']>>;
type WorkflowVersionParity = Expect<Matches<Buzzkit.WorkflowVersion, ReturnType<typeof serializeVersion>>>;

type RunParity = Expect<Matches<Buzzkit.Run, ApiRunRecord>>;
type RunDetailParity = Expect<Matches<Buzzkit.RunDetail, ApiRunDetail>>;
type RunCountsParity = Expect<Matches<Buzzkit.RunCounts, ApiRunCounts>>;

type EventParity = Expect<Matches<Buzzkit.EventRecord, ApiEventRecord>>;
type TrackedParity = Expect<Matches<Buzzkit.TrackedEvent, ApiTrackedEvent>>;
type EventNameParity = Expect<Matches<Buzzkit.EventName, ReturnType<typeof serializeEventName>>>;

type CredentialParity = Expect<Matches<Buzzkit.Credential, ReturnType<typeof serializeCredential>>>;
type SecretParity = Expect<Matches<Buzzkit.Secret, ReturnType<typeof serializeSecret>>>;
type ApiSource = ReturnType<typeof serializeSource>;
type OpaqueSourceKeys = 'mapping' | 'verification';
type SourceParity = Expect<
  Matches<Omit<Buzzkit.Source, OpaqueSourceKeys>, Omit<ApiSource, OpaqueSourceKeys>>
>;
type SourceMappingParity = Expect<Accepts<Buzzkit.SourceMapping, ApiSource['mapping']>>;
type SourceVerificationParity = Expect<Accepts<Buzzkit.SourceVerification, ApiSource['verification']>>;
type SourceDeliveryParity = Expect<
  Matches<Buzzkit.SourceDelivery, ReturnType<typeof serializeSourceDelivery>>
>;

type TenantParity = Expect<Matches<Buzzkit.Tenant, ReturnType<typeof serializeTenant>>>;
type TenantSettingsParity = Expect<Matches<Buzzkit.TenantSettings, ApiTenantSettings>>;
type StatsParity = Expect<Matches<Buzzkit.Stats, ApiStats>>;
type ImportParity = Expect<Matches<Buzzkit.ImportResult, ApiImportResult>>;

type WorkspaceParity = Expect<Matches<Buzzkit.Workspace, ReturnType<typeof serializeWorkspace>>>;
type MemberParity = Expect<Matches<Buzzkit.WorkspaceMember, ReturnType<typeof serializeMember>>>;
type AuditParity = Expect<Matches<Buzzkit.AuditEvent, ReturnType<typeof serializeAuditEvent>>>;

type WebhookParity = Expect<Matches<Buzzkit.WebhookEndpoint, ReturnType<typeof serializeEndpoint>>>;
type WebhookEventParity = Expect<Matches<Buzzkit.WebhookEvent, ReturnType<typeof serializeWebhookEvent>>>;
type WebhookDeliveryParity = Expect<
  Matches<Buzzkit.WebhookDelivery, ReturnType<typeof serializeWebhookDelivery>>
>;
type WebhookAttemptParity = Expect<
  Matches<Buzzkit.WebhookAttempt, ReturnType<typeof serializeWebhookAttempt>>
>;

export type ContractParity = [
  MessageParity,
  SendParity,
  DeliveryParity,
  AttemptParity,
  MessageDeliveryParity,
  SubscriberDeliveryParity,
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

CREATE TYPE "public"."credential_status" AS ENUM('unvalidated', 'active', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."event_actor_type" AS ENUM('member', 'user', 'key', 'system');--> statement-breakpoint
CREATE TYPE "public"."api_key_kind" AS ENUM('workspace', 'tenant', 'client');--> statement-breakpoint
CREATE TYPE "public"."delivery_attempt_outcome" AS ENUM('sent', 'retry', 'failed', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'retrying', 'sent', 'delivered', 'bounced', 'failed', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'processing', 'completed');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('push', 'email');--> statement-breakpoint
CREATE TYPE "public"."environment" AS ENUM('production', 'sandbox');--> statement-breakpoint
CREATE TYPE "public"."provider" AS ENUM('apns', 'fcm', 'resend');--> statement-breakpoint
CREATE TYPE "public"."subscription_platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."workspace_member_role" AS ENUM('member', 'admin', 'owner');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credential" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "credential_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" bigint NOT NULL,
	"channel" "channel" NOT NULL,
	"provider" "provider" NOT NULL,
	"environment" "environment" DEFAULT 'production' NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"secret_iv" text NOT NULL,
	"dek_ciphertext" text NOT NULL,
	"dek_iv" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "credential_status" DEFAULT 'unvalidated' NOT NULL,
	"last_error" text,
	"validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "credential_details_object" CHECK (jsonb_typeof("credential"."details") = 'object')
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" bigint,
	"tenant_id" bigint,
	"event" text NOT NULL,
	"actor_type" "event_actor_type" NOT NULL,
	"actor_user_id" text,
	"actor_member_id" bigint,
	"actor_key_id" bigint,
	"actor_display" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"data" jsonb,
	"request_id" text,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_invite" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workspace_invite_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" bigint NOT NULL,
	"email" text NOT NULL,
	"role" "workspace_member_role" DEFAULT 'member' NOT NULL,
	"token" text NOT NULL,
	"invited_by_member_id" bigint,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_member_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "api_key_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" bigint NOT NULL,
	"tenant_id" bigint,
	"name" text NOT NULL,
	"kind" "api_key_kind" DEFAULT 'workspace' NOT NULL,
	"key_hash" text NOT NULL,
	"token" text,
	"prefix" text NOT NULL,
	"last4" text NOT NULL,
	"scopes" text[] NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "api_key_kind_tenant" CHECK (("api_key"."kind" = 'workspace') = ("api_key"."tenant_id" is null))
);
--> statement-breakpoint
CREATE TABLE "delivery" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "delivery_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" bigint NOT NULL,
	"message_id" bigint NOT NULL,
	"subscriber_id" bigint NOT NULL,
	"subscription_id" bigint NOT NULL,
	"channel" "channel" NOT NULL,
	"provider" "provider" NOT NULL,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"last_error_message" text,
	"provider_message_id" text,
	"next_attempt_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"first_attempted_at" timestamp with time zone,
	"last_attempted_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_attempt" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "delivery_attempt_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" bigint NOT NULL,
	"delivery_id" bigint NOT NULL,
	"attempt" integer NOT NULL,
	"provider" "provider" NOT NULL,
	"outcome" "delivery_attempt_outcome" NOT NULL,
	"error_code" text,
	"provider_reason" text,
	"provider_status" integer,
	"provider_message_id" text,
	"request" jsonb,
	"response" jsonb,
	"latency_ms" integer,
	"next_attempt_at" timestamp with time zone,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "message_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" bigint NOT NULL,
	"channel" "channel" NOT NULL,
	"topic" text,
	"topic_id" bigint,
	"targets" jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" text,
	"idempotency_fingerprint" text,
	"status" "message_status" DEFAULT 'queued' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"bounced" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"invalid" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"fanout_cursor" bigint DEFAULT 0 NOT NULL,
	"fanout_completed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "message_targets_object" CHECK (jsonb_typeof("message"."targets") = 'object'),
	CONSTRAINT "message_payload_object" CHECK (jsonb_typeof("message"."payload") = 'object')
);
--> statement-breakpoint
CREATE TABLE "subscriber" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subscriber_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" bigint NOT NULL,
	"external_id" text NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"identity_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "subscriber_attributes_object" CHECK (jsonb_typeof("subscriber"."attributes") = 'object')
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subscription_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" bigint NOT NULL,
	"subscriber_id" bigint NOT NULL,
	"channel" "channel" NOT NULL,
	"platform" "subscription_platform",
	"environment" "environment" DEFAULT 'production' NOT NULL,
	"endpoint" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invalidated_at" timestamp with time zone,
	"invalidation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "subscription_push_platform" CHECK ("subscription"."channel" <> 'push' or "subscription"."platform" is not null)
);
--> statement-breakpoint
CREATE TABLE "tenant" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tenant_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" bigint NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"identity_secret" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tenant_settings_object" CHECK (jsonb_typeof("tenant"."settings") = 'object'),
	CONSTRAINT "tenant_metadata_object" CHECK (jsonb_typeof("tenant"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "subscriber_preference" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subscriber_preference_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" bigint NOT NULL,
	"subscriber_id" bigint NOT NULL,
	"topic_id" bigint NOT NULL,
	"channel" "channel" NOT NULL,
	"opted_in" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "topic_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" bigint NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"default_opted_in" boolean DEFAULT true NOT NULL,
	"channel_defaults" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "topic_channel_defaults_object" CHECK (jsonb_typeof("topic"."channel_defaults") = 'object')
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workspace_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workspace_member" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workspace_member_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" bigint NOT NULL,
	"user_id" text NOT NULL,
	"role" "workspace_member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential" ADD CONSTRAINT "credential_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invite" ADD CONSTRAINT "workspace_invite_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invite" ADD CONSTRAINT "workspace_invite_invited_by_member_id_workspace_member_id_fk" FOREIGN KEY ("invited_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invite" ADD CONSTRAINT "workspace_invite_accepted_member_id_workspace_member_id_fk" FOREIGN KEY ("accepted_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery" ADD CONSTRAINT "delivery_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery" ADD CONSTRAINT "delivery_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery" ADD CONSTRAINT "delivery_subscriber_id_subscriber_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscriber"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery" ADD CONSTRAINT "delivery_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscription"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempt" ADD CONSTRAINT "delivery_attempt_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempt" ADD CONSTRAINT "delivery_attempt_delivery_id_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."delivery"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber" ADD CONSTRAINT "subscriber_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_subscriber_id_subscriber_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscriber"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant" ADD CONSTRAINT "tenant_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_preference" ADD CONSTRAINT "subscriber_preference_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_preference" ADD CONSTRAINT "subscriber_preference_subscriber_id_subscriber_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscriber"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_preference" ADD CONSTRAINT "subscriber_preference_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "credential_tenant_channel_provider_environment_unique" ON "credential" USING btree ("tenant_id","channel","provider","environment") WHERE "credential"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "event_workspace_idx" ON "event" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "event_workspace_event_idx" ON "event" USING btree ("workspace_id","event","id");--> statement-breakpoint
CREATE INDEX "event_created_brin" ON "event" USING brin ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invite_token_unique" ON "workspace_invite" USING btree ("token") WHERE "workspace_invite"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invite_workspace_email_unique" ON "workspace_invite" USING btree ("workspace_id","email") WHERE "workspace_invite"."deleted_at" is null and "workspace_invite"."accepted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_key_hash_unique" ON "api_key" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_key_workspace_idx" ON "api_key" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "api_key_tenant_idx" ON "api_key" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_message_subscription_unique" ON "delivery" USING btree ("message_id","subscription_id");--> statement-breakpoint
CREATE INDEX "delivery_message_idx" ON "delivery" USING btree ("message_id","id");--> statement-breakpoint
CREATE INDEX "delivery_due_idx" ON "delivery" USING btree ("next_attempt_at") WHERE "delivery"."status" = 'retrying' and "delivery"."next_attempt_at" is not null;--> statement-breakpoint
CREATE INDEX "delivery_message_status_idx" ON "delivery" USING btree ("message_id","status","id");--> statement-breakpoint
CREATE INDEX "delivery_stale_idx" ON "delivery" USING btree (coalesce("lease_expires_at", "created_at")) WHERE "delivery"."status" in ('pending', 'retrying') and "delivery"."next_attempt_at" is null;--> statement-breakpoint
CREATE INDEX "delivery_created_brin" ON "delivery" USING brin ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_attempt_delivery_attempt_unique" ON "delivery_attempt" USING btree ("delivery_id","attempt");--> statement-breakpoint
CREATE INDEX "delivery_attempt_created_brin" ON "delivery_attempt" USING brin ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_tenant_idempotency_key_unique" ON "message" USING btree ("tenant_id","idempotency_key") WHERE "message"."idempotency_key" is not null and "message"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "message_tenant_idx" ON "message" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE INDEX "message_processing_idx" ON "message" USING btree ("updated_at") WHERE "message"."status" in ('queued', 'processing') and "message"."fanout_completed_at" is null;--> statement-breakpoint
CREATE INDEX "message_expiry_idx" ON "message" USING btree ("expires_at") WHERE "message"."status" <> 'completed';--> statement-breakpoint
CREATE INDEX "message_unfinalized_idx" ON "message" USING btree ("updated_at") WHERE "message"."status" = 'processing' and "message"."fanout_completed_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriber_tenant_external_id_unique" ON "subscriber" USING btree ("tenant_id","external_id") WHERE "subscriber"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "subscriber_tenant_idx" ON "subscriber" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_tenant_channel_endpoint_unique" ON "subscription" USING btree ("tenant_id","channel","endpoint") WHERE "subscription"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "subscription_subscriber_idx" ON "subscription" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "subscription_fanout_idx" ON "subscription" USING btree ("tenant_id","channel","id") WHERE "subscription"."enabled" = true and "subscription"."status" = 'active' and "subscription"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_workspace_slug_unique" ON "tenant" USING btree ("workspace_id","slug") WHERE "tenant"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_workspace_default_unique" ON "tenant" USING btree ("workspace_id") WHERE "tenant"."deleted_at" is null and "tenant"."is_default" = true;--> statement-breakpoint
CREATE INDEX "tenant_workspace_idx" ON "tenant" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriber_preference_subscriber_topic_channel_unique" ON "subscriber_preference" USING btree ("subscriber_id","topic_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_tenant_slug_unique" ON "topic" USING btree ("tenant_id","slug") WHERE "topic"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_slug_unique" ON "workspace" USING btree ("slug") WHERE "workspace"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_member_workspace_user_unique" ON "workspace_member" USING btree ("workspace_id","user_id") WHERE "workspace_member"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "workspace_member_user_idx" ON "workspace_member" USING btree ("user_id");
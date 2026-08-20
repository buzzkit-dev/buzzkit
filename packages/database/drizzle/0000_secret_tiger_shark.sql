CREATE TYPE "public"."credential_environment" AS ENUM('production', 'sandbox');--> statement-breakpoint
CREATE TYPE "public"."credential_provider" AS ENUM('apns', 'fcm', 'resend');--> statement-breakpoint
CREATE TYPE "public"."credential_status" AS ENUM('unvalidated', 'active', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."event_actor_type" AS ENUM('member', 'user', 'key', 'system');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('push', 'email');--> statement-breakpoint
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
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credential" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "credential_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tenant_id" integer NOT NULL,
	"channel" "channel" DEFAULT 'push' NOT NULL,
	"provider" "credential_provider" NOT NULL,
	"environment" "credential_environment" DEFAULT 'production' NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"secret_iv" text NOT NULL,
	"dek_ciphertext" text NOT NULL,
	"dek_iv" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "credential_status" DEFAULT 'unvalidated' NOT NULL,
	"last_error" text,
	"validated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"workspace_id" integer,
	"tenant_id" integer,
	"event" text NOT NULL,
	"actor_type" "event_actor_type" NOT NULL,
	"actor_user_id" text,
	"actor_member_id" integer,
	"actor_key_id" integer,
	"actor_display" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"data" jsonb,
	"request_id" text,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_invite" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workspace_invite_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"workspace_id" integer NOT NULL,
	"email" text NOT NULL,
	"role" "workspace_member_role" DEFAULT 'member' NOT NULL,
	"token" text NOT NULL,
	"invited_by_member_id" integer,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"accepted_member_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "api_key_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"workspace_id" integer NOT NULL,
	"tenant_id" integer,
	"name" text NOT NULL,
	"kind" text DEFAULT 'workspace' NOT NULL,
	"key_hash" text NOT NULL,
	"token" text,
	"prefix" text NOT NULL,
	"last4" text NOT NULL,
	"scopes" text[] NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "subscriber" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subscriber_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tenant_id" integer NOT NULL,
	"external_id" text NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"identity_verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subscription_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tenant_id" integer NOT NULL,
	"subscriber_id" integer NOT NULL,
	"channel" "channel" NOT NULL,
	"platform" "subscription_platform",
	"endpoint" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"invalidated_at" timestamp,
	"invalidation_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tenant" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tenant_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"workspace_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"identity_secret" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "subscriber_preference" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subscriber_preference_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tenant_id" integer NOT NULL,
	"subscriber_id" integer NOT NULL,
	"topic_id" integer NOT NULL,
	"channel" "channel" DEFAULT 'push' NOT NULL,
	"opted_in" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "topic_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tenant_id" integer NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"default_opted_in" boolean DEFAULT true NOT NULL,
	"channel_defaults" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workspace_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "workspace_member" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workspace_member_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"workspace_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"role" "workspace_member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential" ADD CONSTRAINT "credential_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invite" ADD CONSTRAINT "workspace_invite_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invite" ADD CONSTRAINT "workspace_invite_invited_by_member_id_workspace_member_id_fk" FOREIGN KEY ("invited_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invite" ADD CONSTRAINT "workspace_invite_accepted_member_id_workspace_member_id_fk" FOREIGN KEY ("accepted_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
CREATE UNIQUE INDEX "credential_tenant_provider_env_unique" ON "credential" USING btree ("tenant_id","channel","provider","environment") WHERE "credential"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "credential_tenant_idx" ON "credential" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "event_workspace_idx" ON "event" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "event_workspace_event_idx" ON "event" USING btree ("workspace_id","event");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invite_token_unique" ON "workspace_invite" USING btree ("token") WHERE "workspace_invite"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invite_workspace_email_unique" ON "workspace_invite" USING btree ("workspace_id","email") WHERE "workspace_invite"."deleted_at" is null and "workspace_invite"."accepted_at" is null;--> statement-breakpoint
CREATE INDEX "workspace_invite_workspace_idx" ON "workspace_invite" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_hash_unique" ON "api_key" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_key_workspace_idx" ON "api_key" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "api_key_tenant_idx" ON "api_key" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriber_tenant_external_unique" ON "subscriber" USING btree ("tenant_id","external_id") WHERE "subscriber"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "subscriber_tenant_idx" ON "subscriber" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_tenant_channel_endpoint_unique" ON "subscription" USING btree ("tenant_id","channel","endpoint") WHERE "subscription"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "subscription_subscriber_idx" ON "subscription" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "subscription_tenant_idx" ON "subscription" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_workspace_slug_unique" ON "tenant" USING btree ("workspace_id","slug") WHERE "tenant"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_workspace_default_unique" ON "tenant" USING btree ("workspace_id") WHERE "tenant"."deleted_at" is null and "tenant"."is_default" = true;--> statement-breakpoint
CREATE INDEX "tenant_workspace_idx" ON "tenant" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriber_preference_unique" ON "subscriber_preference" USING btree ("subscriber_id","topic_id","channel");--> statement-breakpoint
CREATE INDEX "subscriber_preference_topic_idx" ON "subscriber_preference" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "subscriber_preference_tenant_idx" ON "subscriber_preference" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_tenant_slug_unique" ON "topic" USING btree ("tenant_id","slug") WHERE "topic"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "topic_tenant_idx" ON "topic" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_slug_unique" ON "workspace" USING btree ("slug") WHERE "workspace"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_member_workspace_user_unique" ON "workspace_member" USING btree ("workspace_id","user_id") WHERE "workspace_member"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "workspace_member_user_idx" ON "workspace_member" USING btree ("user_id");
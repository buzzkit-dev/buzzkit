CREATE TYPE "public"."credential_environment" AS ENUM('production', 'sandbox');--> statement-breakpoint
CREATE TYPE "public"."credential_provider" AS ENUM('apns', 'fcm');--> statement-breakpoint
CREATE TYPE "public"."credential_status" AS ENUM('unvalidated', 'active', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."event_actor_type" AS ENUM('member', 'user', 'key', 'system');--> statement-breakpoint
CREATE TABLE "credential" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "credential_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tenant_id" integer NOT NULL,
	"channel" text DEFAULT 'push' NOT NULL,
	"provider" "credential_provider" NOT NULL,
	"environment" "credential_environment" DEFAULT 'production' NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"secret_iv" text NOT NULL,
	"dek_ciphertext" text NOT NULL,
	"dek_iv" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "credential_status" DEFAULT 'unvalidated' NOT NULL,
	"validated_at" timestamp,
	"last_error" text,
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
ALTER TABLE "credential" ADD CONSTRAINT "credential_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credential_tenant_provider_env_unique" ON "credential" USING btree ("tenant_id","channel","provider","environment") WHERE "credential"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "credential_tenant_idx" ON "credential" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "event_workspace_idx" ON "event" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "event_workspace_event_idx" ON "event" USING btree ("workspace_id","event");
CREATE TYPE "public"."webhook_delivery_status" AS ENUM('pending', 'success', 'failed', 'exhausted');--> statement-breakpoint
CREATE TYPE "public"."webhook_event_source" AS ENUM('audit', 'stream');--> statement-breakpoint
CREATE TABLE "webhook_attempt" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "webhook_attempt_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"delivery_id" bigint NOT NULL,
	"attempt" integer NOT NULL,
	"status" integer,
	"error" text,
	"duration_ms" integer NOT NULL,
	"response_body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "webhook_delivery_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" bigint NOT NULL,
	"endpoint_id" bigint NOT NULL,
	"event_id" bigint NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_status" integer,
	"last_error" text,
	"last_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoint" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "webhook_endpoint_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" bigint NOT NULL,
	"tenant_id" bigint,
	"url" text NOT NULL,
	"description" text,
	"events" text[] DEFAULT '{}' NOT NULL,
	"secret" text NOT NULL,
	"previous_secret" text,
	"previous_secret_expires_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"disabled_reason" text,
	"failing_since" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "webhook_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" bigint NOT NULL,
	"tenant_id" bigint,
	"subscriber_id" bigint,
	"source" "webhook_event_source" NOT NULL,
	"source_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_attempt" ADD CONSTRAINT "webhook_attempt_delivery_id_webhook_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."webhook_delivery"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_endpoint_id_webhook_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoint"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_event_id_webhook_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."webhook_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_event" ADD CONSTRAINT "webhook_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_attempt_delivery_idx" ON "webhook_attempt" USING btree ("delivery_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_delivery_unique" ON "webhook_delivery" USING btree ("endpoint_id","event_id");--> statement-breakpoint
CREATE INDEX "webhook_delivery_endpoint_idx" ON "webhook_delivery" USING btree ("endpoint_id","id");--> statement-breakpoint
CREATE INDEX "webhook_delivery_event_idx" ON "webhook_delivery" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "webhook_delivery_workspace_idx" ON "webhook_delivery" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "webhook_delivery_due_idx" ON "webhook_delivery" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "webhook_endpoint_workspace_idx" ON "webhook_endpoint" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_event_source_unique" ON "webhook_event" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "webhook_event_workspace_idx" ON "webhook_event" USING btree ("workspace_id","id");
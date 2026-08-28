CREATE TYPE "public"."campaign_run_status" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'scheduled', 'paused', 'completed');--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "campaign_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" bigint NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"channel" "channel" NOT NULL,
	"topic_id" bigint,
	"segment_id" bigint,
	"where" jsonb,
	"payload" jsonb NOT NULL,
	"schedule" jsonb NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "campaign_run" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "campaign_run_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"campaign_id" bigint NOT NULL,
	"tenant_id" bigint NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"timezone" text,
	"message_id" bigint,
	"status" "campaign_run_status" NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_segment_id_segment_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_run" ADD CONSTRAINT "campaign_run_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_run" ADD CONSTRAINT "campaign_run_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_run" ADD CONSTRAINT "campaign_run_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_tenant_slug_unique" ON "campaign" USING btree ("tenant_id","slug") WHERE "campaign"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "campaign_tenant_idx" ON "campaign" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "campaign_due_idx" ON "campaign" USING btree ("next_run_at") WHERE "campaign"."status" = 'scheduled' and "campaign"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_run_moment_unique" ON "campaign_run" USING btree ("campaign_id","scheduled_for",coalesce("timezone", ''));--> statement-breakpoint
CREATE INDEX "campaign_run_campaign_idx" ON "campaign_run" USING btree ("campaign_id","created_at");
CREATE TYPE "public"."live_activity_kind" AS ENUM('activity', 'start');--> statement-breakpoint
CREATE TABLE "live_activity" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "live_activity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" bigint NOT NULL,
	"subscriber_id" bigint NOT NULL,
	"kind" "live_activity_kind" DEFAULT 'activity' NOT NULL,
	"activity_id" text,
	"attributes_type" text NOT NULL,
	"token" text NOT NULL,
	"environment" "environment" DEFAULT 'production' NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "live_activity_id_presence" CHECK ("live_activity"."kind" <> 'activity' or "live_activity"."activity_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "live_activity" ADD CONSTRAINT "live_activity_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_activity" ADD CONSTRAINT "live_activity_subscriber_id_subscriber_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscriber"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "live_activity_activity_unique" ON "live_activity" USING btree ("tenant_id","subscriber_id","activity_id") WHERE "live_activity"."kind" = 'activity' and "live_activity"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "live_activity_start_unique" ON "live_activity" USING btree ("tenant_id","subscriber_id","attributes_type") WHERE "live_activity"."kind" = 'start' and "live_activity"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "live_activity_subscriber_idx" ON "live_activity" USING btree ("subscriber_id");
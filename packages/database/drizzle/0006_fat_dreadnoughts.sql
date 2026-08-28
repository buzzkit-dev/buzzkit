ALTER TYPE "public"."message_status" ADD VALUE 'scheduled';--> statement-breakpoint
ALTER TYPE "public"."message_status" ADD VALUE 'canceled';--> statement-breakpoint
ALTER TABLE "campaign" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campaign_run" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "campaign" CASCADE;--> statement-breakpoint
DROP TABLE "campaign_run" CASCADE;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "schedule" jsonb;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "scheduled_for" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "scheduled_zones" jsonb;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "canceled_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "message_due_idx" ON "message" USING btree ("scheduled_for") WHERE "message"."schedule" is not null and "message"."fanout_completed_at" is null and "message"."canceled_at" is null;--> statement-breakpoint
DROP TYPE "public"."campaign_run_status";--> statement-breakpoint
DROP TYPE "public"."campaign_status";
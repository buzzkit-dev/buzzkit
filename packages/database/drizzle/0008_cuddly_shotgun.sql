ALTER TABLE "message" ADD COLUMN "run_id" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "run_step" text;--> statement-breakpoint
CREATE INDEX "message_run_idx" ON "message" USING btree ("tenant_id","run_id") WHERE "message"."run_id" is not null;
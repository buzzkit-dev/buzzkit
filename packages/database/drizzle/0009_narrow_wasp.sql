CREATE TABLE "workflow_schedule" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workflow_schedule_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" bigint NOT NULL,
	"workflow_id" bigint NOT NULL,
	"workflow_version_id" bigint NOT NULL,
	"fire_at" timestamp with time zone NOT NULL,
	"zone" text NOT NULL,
	"member_cursor" bigint DEFAULT 0 NOT NULL,
	"started" integer DEFAULT 0 NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "workflow_schedule" ADD CONSTRAINT "workflow_schedule_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_schedule" ADD CONSTRAINT "workflow_schedule_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_schedule" ADD CONSTRAINT "workflow_schedule_workflow_version_id_workflow_version_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "public"."workflow_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_schedule_fire_unique" ON "workflow_schedule" USING btree ("workflow_version_id","fire_at","zone");--> statement-breakpoint
CREATE INDEX "workflow_schedule_open_idx" ON "workflow_schedule" USING btree ("fire_at") WHERE "workflow_schedule"."finished_at" is null and "workflow_schedule"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "workflow_schedule_workflow_idx" ON "workflow_schedule" USING btree ("workflow_id","fire_at");
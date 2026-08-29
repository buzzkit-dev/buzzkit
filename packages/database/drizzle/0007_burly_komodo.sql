CREATE TYPE "public"."workflow_status" AS ENUM('draft', 'active', 'paused');--> statement-breakpoint
CREATE TABLE "workflow" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workflow_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" bigint NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "workflow_status" DEFAULT 'draft' NOT NULL,
	"current_version_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workflow_version" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workflow_version_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workflow_id" bigint NOT NULL,
	"version" integer NOT NULL,
	"spec" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_version" ADD CONSTRAINT "workflow_version_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_tenant_slug_unique" ON "workflow" USING btree ("tenant_id","slug") WHERE "workflow"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "workflow_tenant_idx" ON "workflow" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_version_unique" ON "workflow_version" USING btree ("workflow_id","version");
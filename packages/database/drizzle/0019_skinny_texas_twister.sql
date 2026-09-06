CREATE TYPE "public"."subscriber_alias_source" AS ENUM('system', 'manual');--> statement-breakpoint
CREATE TABLE "subscriber_alias" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subscriber_alias_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" bigint NOT NULL,
	"subscriber_id" bigint NOT NULL,
	"external_id" text NOT NULL,
	"source" "subscriber_alias_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "subscriber_alias" ADD CONSTRAINT "subscriber_alias_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_alias" ADD CONSTRAINT "subscriber_alias_subscriber_id_subscriber_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscriber"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriber_alias_tenant_external_id_unique" ON "subscriber_alias" USING btree ("tenant_id","external_id") WHERE "subscriber_alias"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "subscriber_alias_subscriber_idx" ON "subscriber_alias" USING btree ("subscriber_id");
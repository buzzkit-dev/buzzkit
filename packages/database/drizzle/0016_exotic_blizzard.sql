CREATE TABLE "topic_category" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "topic_category_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" bigint NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "topic" ADD COLUMN "category_id" bigint;--> statement-breakpoint
ALTER TABLE "topic_category" ADD CONSTRAINT "topic_category_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "topic_category_tenant_name_unique" ON "topic_category" USING btree ("tenant_id",lower("name")) WHERE "topic_category"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_category_id_topic_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."topic_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topic_category_idx" ON "topic" USING btree ("category_id");
CREATE TABLE "segment" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "segment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" bigint NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"current_version_id" bigint,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "segment_version" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "segment_version_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"segment_id" bigint NOT NULL,
	"version" integer NOT NULL,
	"expression" jsonb NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "segment" ADD CONSTRAINT "segment_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment" ADD CONSTRAINT "segment_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment_version" ADD CONSTRAINT "segment_version_segment_id_segment_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment_version" ADD CONSTRAINT "segment_version_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "segment_tenant_slug_unique" ON "segment" USING btree ("tenant_id","slug") WHERE "segment"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "segment_tenant_idx" ON "segment" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "segment_version_unique" ON "segment_version" USING btree ("segment_id","version");
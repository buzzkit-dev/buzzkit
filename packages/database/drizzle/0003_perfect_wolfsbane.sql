CREATE TYPE "public"."device_platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TYPE "public"."device_status" AS ENUM('active', 'invalid');--> statement-breakpoint
CREATE TABLE "device" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "device_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tenant_id" integer NOT NULL,
	"subscriber_id" integer NOT NULL,
	"platform" "device_platform" NOT NULL,
	"token" text NOT NULL,
	"status" "device_status" DEFAULT 'active' NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"invalidated_at" timestamp,
	"invalidation_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "subscriber" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subscriber_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tenant_id" integer NOT NULL,
	"external_id" text NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "subscriber_preference" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subscriber_preference_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tenant_id" integer NOT NULL,
	"subscriber_id" integer NOT NULL,
	"topic_id" integer NOT NULL,
	"opted_in" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "topic_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tenant_id" integer NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"default_opted_in" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "token" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "identity_secret" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "require_identity_verification" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_subscriber_id_subscriber_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscriber"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber" ADD CONSTRAINT "subscriber_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_preference" ADD CONSTRAINT "subscriber_preference_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_preference" ADD CONSTRAINT "subscriber_preference_subscriber_id_subscriber_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscriber"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_preference" ADD CONSTRAINT "subscriber_preference_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_tenant_token_unique" ON "device" USING btree ("tenant_id","token") WHERE "device"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "device_subscriber_idx" ON "device" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "device_tenant_idx" ON "device" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriber_tenant_external_unique" ON "subscriber" USING btree ("tenant_id","external_id") WHERE "subscriber"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "subscriber_tenant_idx" ON "subscriber" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriber_preference_unique" ON "subscriber_preference" USING btree ("subscriber_id","topic_id");--> statement-breakpoint
CREATE INDEX "subscriber_preference_topic_idx" ON "subscriber_preference" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "subscriber_preference_tenant_idx" ON "subscriber_preference" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_tenant_slug_unique" ON "topic" USING btree ("tenant_id","slug") WHERE "topic"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "topic_tenant_idx" ON "topic" USING btree ("tenant_id");
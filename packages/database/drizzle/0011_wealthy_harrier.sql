CREATE TYPE "public"."source_delivery_outcome" AS ENUM('event', 'duplicate', 'dropped', 'rejected', 'unverified');--> statement-breakpoint
CREATE TYPE "public"."source_provider" AS ENUM('stripe', 'superwall', 'generic');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('unverified', 'active', 'paused');--> statement-breakpoint
CREATE TABLE "source" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "source_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" bigint NOT NULL,
	"name" text NOT NULL,
	"provider" "source_provider" NOT NULL,
	"status" "source_status" DEFAULT 'unverified' NOT NULL,
	"mapping" jsonb NOT NULL,
	"secret_ciphertext" text,
	"secret_iv" text,
	"dek_ciphertext" text,
	"dek_iv" text,
	"key_version" integer,
	"last_delivery_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "source_delivery" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "source_delivery_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" bigint NOT NULL,
	"source_id" bigint NOT NULL,
	"provider_event_id" text,
	"provider_type" text,
	"outcome" "source_delivery_outcome" NOT NULL,
	"reason" text,
	"detail" text,
	"subscriber_id" bigint,
	"event_name" text,
	"event_id" text,
	"payload" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_delivery" ADD CONSTRAINT "source_delivery_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_delivery" ADD CONSTRAINT "source_delivery_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_delivery" ADD CONSTRAINT "source_delivery_subscriber_id_subscriber_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscriber"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_tenant_idx" ON "source" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE INDEX "source_delivery_source_idx" ON "source_delivery" USING btree ("source_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_delivery_event_unique" ON "source_delivery" USING btree ("source_id","provider_event_id") WHERE "source_delivery"."outcome" = 'event' and "source_delivery"."provider_event_id" is not null;
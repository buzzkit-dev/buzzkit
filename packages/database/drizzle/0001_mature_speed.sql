CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'sent', 'failed', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'processing', 'completed');--> statement-breakpoint
CREATE TABLE "delivery" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "delivery_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tenant_id" integer NOT NULL,
	"message_id" integer NOT NULL,
	"subscriber_id" integer NOT NULL,
	"subscription_id" integer NOT NULL,
	"channel" "channel" NOT NULL,
	"provider" text NOT NULL,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"provider_message_id" text,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "message_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tenant_id" integer NOT NULL,
	"channel" "channel" NOT NULL,
	"topic" text,
	"targets" jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" text,
	"status" "message_status" DEFAULT 'queued' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"invalid" integer DEFAULT 0 NOT NULL,
	"fanout_completed_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "delivery" ADD CONSTRAINT "delivery_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery" ADD CONSTRAINT "delivery_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery" ADD CONSTRAINT "delivery_subscriber_id_subscriber_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscriber"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery" ADD CONSTRAINT "delivery_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscription"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_message_subscription_unique" ON "delivery" USING btree ("message_id","subscription_id");--> statement-breakpoint
CREATE INDEX "delivery_message_idx" ON "delivery" USING btree ("message_id","id");--> statement-breakpoint
CREATE INDEX "delivery_tenant_idx" ON "delivery" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_tenant_idempotency_unique" ON "message" USING btree ("tenant_id","idempotency_key") WHERE "message"."idempotency_key" is not null and "message"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "message_tenant_idx" ON "message" USING btree ("tenant_id","id");
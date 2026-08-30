CREATE TABLE "secret" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "secret_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" bigint NOT NULL,
	"name" text NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"secret_iv" text NOT NULL,
	"dek_ciphertext" text NOT NULL,
	"dek_iv" text NOT NULL,
	"key_version" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "secret" ADD CONSTRAINT "secret_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "secret_tenant_name_unique" ON "secret" USING btree ("tenant_id","name") WHERE "secret"."deleted_at" is null;
ALTER TABLE "source" ALTER COLUMN "provider" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "source" ADD COLUMN "verification" jsonb DEFAULT '{"scheme":"header","header":"x-buzzkit-secret"}'::jsonb NOT NULL;--> statement-breakpoint
DROP TYPE "public"."source_provider";
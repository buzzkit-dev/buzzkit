CREATE TYPE "public"."credential_channel" AS ENUM('push');--> statement-breakpoint
ALTER TABLE "credential" ALTER COLUMN "channel" SET DEFAULT 'push'::"public"."credential_channel";--> statement-breakpoint
ALTER TABLE "credential" ALTER COLUMN "channel" SET DATA TYPE "public"."credential_channel" USING "channel"::"public"."credential_channel";
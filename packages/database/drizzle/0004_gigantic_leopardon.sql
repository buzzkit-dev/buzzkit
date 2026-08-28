ALTER TABLE "segment" DROP CONSTRAINT "segment_created_by_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "segment_version" DROP CONSTRAINT "segment_version_created_by_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "segment" DROP COLUMN "created_by_user_id";--> statement-breakpoint
ALTER TABLE "segment_version" DROP COLUMN "created_by_user_id";
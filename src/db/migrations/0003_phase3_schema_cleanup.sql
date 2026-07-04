ALTER TABLE "media" ALTER COLUMN "provider_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ALTER COLUMN "uploaded_by" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "preview_token" varchar(255);--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "r2_key";--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_preview_token_unique" UNIQUE("preview_token");
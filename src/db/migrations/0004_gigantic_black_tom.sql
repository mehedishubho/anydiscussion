CREATE TABLE "redirects" (
	"id" serial PRIMARY KEY NOT NULL,
	"old_path" varchar(255) NOT NULL,
	"new_path" varchar(255) NOT NULL,
	"status_code" integer DEFAULT 301 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "redirects_old_path_unique" UNIQUE("old_path")
);

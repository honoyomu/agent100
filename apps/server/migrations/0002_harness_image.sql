CREATE TABLE "harness_image" (
	"image_id" text PRIMARY KEY NOT NULL,
	"harness" text NOT NULL,
	"name" text NOT NULL,
	"versions" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

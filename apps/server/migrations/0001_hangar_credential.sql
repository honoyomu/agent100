CREATE TABLE "hangar_credential" (
	"id" text PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"access_expires_at" timestamp NOT NULL,
	"refresh_token" text NOT NULL,
	"refresh_expires_at" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

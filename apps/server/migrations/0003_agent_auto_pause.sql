ALTER TABLE "agent" ADD COLUMN "auto_pause" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "agent" ADD COLUMN "idle_timeout_seconds" integer DEFAULT 300 NOT NULL;
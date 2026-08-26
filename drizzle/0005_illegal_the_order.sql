ALTER TABLE "rate_limit_state" ADD COLUMN "bucket" text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE "rate_limit_state" DROP CONSTRAINT "rate_limit_state_pkey";--> statement-breakpoint
ALTER TABLE "rate_limit_state" ADD CONSTRAINT "rate_limit_state_userId_bucket_pk" PRIMARY KEY("userId","bucket");

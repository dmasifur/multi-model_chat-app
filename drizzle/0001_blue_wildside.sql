CREATE TABLE "rate_limit_state" (
	"userId" text PRIMARY KEY NOT NULL,
	"windowStart" timestamp NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_log" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"modelId" text NOT NULL,
	"inputTokens" integer,
	"outputTokens" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rate_limit_state" ADD CONSTRAINT "rate_limit_state_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
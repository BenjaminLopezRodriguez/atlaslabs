CREATE TABLE "atlas_space_turn" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"threadId" varchar(64) NOT NULL,
	"messageId" varchar(64) NOT NULL,
	"machineId" varchar(64) NOT NULL,
	"userId" varchar(64) NOT NULL,
	"userAsk" text NOT NULL,
	"paths" jsonb,
	"runKind" varchar(16),
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"claimedAt" timestamp with time zone,
	"finishedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "atlas_space_turn" ADD CONSTRAINT "atlas_space_turn_threadId_atlas_thread_id_fk" FOREIGN KEY ("threadId") REFERENCES "public"."atlas_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_space_turn" ADD CONSTRAINT "atlas_space_turn_messageId_atlas_message_id_fk" FOREIGN KEY ("messageId") REFERENCES "public"."atlas_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_space_turn" ADD CONSTRAINT "atlas_space_turn_userId_atlas_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "space_turn_claim_idx" ON "atlas_space_turn" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "space_turn_live_idx" ON "atlas_space_turn" USING btree ("threadId") WHERE status in ('queued', 'running');
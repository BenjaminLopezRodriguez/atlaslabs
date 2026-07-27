CREATE TABLE "atlas_ping" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"machineId" varchar(64) NOT NULL,
	"workspaceId" varchar(64) NOT NULL,
	"question" text NOT NULL,
	"context" varchar(256),
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"answer" text,
	"channel" varchar(16) NOT NULL,
	"replyTokenHash" varchar(64) NOT NULL,
	"askedByUserId" varchar(64),
	"askedByDeviceId" varchar(64),
	"answeredByUserId" varchar(64),
	"notifiedAt" timestamp with time zone,
	"notifyError" varchar(512),
	"expiresAt" timestamp with time zone NOT NULL,
	"answeredAt" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atlas_ping" ADD CONSTRAINT "atlas_ping_machineId_atlas_machine_id_fk" FOREIGN KEY ("machineId") REFERENCES "public"."atlas_machine"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_ping" ADD CONSTRAINT "atlas_ping_askedByUserId_atlas_user_id_fk" FOREIGN KEY ("askedByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ping_reply_token_idx" ON "atlas_ping" USING btree ("replyTokenHash");--> statement-breakpoint
CREATE INDEX "ping_machine_idx" ON "atlas_ping" USING btree ("machineId","created_at");
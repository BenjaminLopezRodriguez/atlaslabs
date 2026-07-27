CREATE TABLE "atlas_connection" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"userId" varchar(64) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"accessToken" text NOT NULL,
	"externalId" varchar(128),
	"login" varchar(256),
	"scope" varchar(512),
	"created_at" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "atlas_machine_index" (
	"machineId" varchar(64) PRIMARY KEY NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL,
	"builtAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_space_edit" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"machineId" varchar(64) NOT NULL,
	"threadId" varchar(64),
	"path" varchar(1024) NOT NULL,
	"before" text,
	"after" text NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"proposedByUserId" varchar(64),
	"created_at" timestamp with time zone NOT NULL,
	"resolvedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "atlas_connection" ADD CONSTRAINT "atlas_connection_userId_atlas_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."atlas_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_machine_index" ADD CONSTRAINT "atlas_machine_index_machineId_atlas_machine_id_fk" FOREIGN KEY ("machineId") REFERENCES "public"."atlas_machine"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_space_edit" ADD CONSTRAINT "atlas_space_edit_machineId_atlas_machine_id_fk" FOREIGN KEY ("machineId") REFERENCES "public"."atlas_machine"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_space_edit" ADD CONSTRAINT "atlas_space_edit_threadId_atlas_thread_id_fk" FOREIGN KEY ("threadId") REFERENCES "public"."atlas_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_space_edit" ADD CONSTRAINT "atlas_space_edit_proposedByUserId_atlas_user_id_fk" FOREIGN KEY ("proposedByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connection_user_provider_idx" ON "atlas_connection" USING btree ("userId","provider");--> statement-breakpoint
CREATE INDEX "space_edit_thread_idx" ON "atlas_space_edit" USING btree ("threadId","created_at");--> statement-breakpoint
CREATE INDEX "space_edit_machine_status_idx" ON "atlas_space_edit" USING btree ("machineId","status");
CREATE TABLE "atlas_machine_exec" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"machineId" varchar(64) NOT NULL,
	"cmd" text NOT NULL,
	"cwd" varchar(512),
	"exitCode" integer,
	"stdout" text,
	"stderr" text,
	"durationMs" integer,
	"ranByUserId" varchar(64),
	"ranByDeviceId" varchar(64),
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_machine" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"workspaceId" varchar(64) NOT NULL,
	"slug" varchar(63) NOT NULL,
	"name" varchar(256),
	"templateId" varchar(64),
	"status" varchar(16) DEFAULT 'provisioning' NOT NULL,
	"driver" varchar(32) DEFAULT 'mock' NOT NULL,
	"handle" varchar(256),
	"region" varchar(32),
	"ports" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"createdByUserId" varchar(64),
	"createdByDeviceId" varchar(64),
	"created_at" timestamp with time zone NOT NULL,
	"lastSeenAt" timestamp with time zone,
	"suspendedAt" timestamp with time zone,
	"terminatedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "atlas_machine_exec" ADD CONSTRAINT "atlas_machine_exec_machineId_atlas_machine_id_fk" FOREIGN KEY ("machineId") REFERENCES "public"."atlas_machine"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_machine_exec" ADD CONSTRAINT "atlas_machine_exec_ranByUserId_atlas_user_id_fk" FOREIGN KEY ("ranByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_machine" ADD CONSTRAINT "atlas_machine_workspaceId_atlas_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."atlas_workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_machine" ADD CONSTRAINT "atlas_machine_createdByUserId_atlas_user_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "machine_exec_machine_idx" ON "atlas_machine_exec" USING btree ("machineId","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "machine_slug_idx" ON "atlas_machine" USING btree ("workspaceId","slug");--> statement-breakpoint
CREATE INDEX "machine_workspace_idx" ON "atlas_machine" USING btree ("workspaceId");
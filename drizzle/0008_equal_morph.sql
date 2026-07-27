CREATE TABLE "atlas_deploy_token" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"machineId" varchar(64) NOT NULL,
	"workspaceId" varchar(64) NOT NULL,
	"tokenHash" varchar(64) NOT NULL,
	"tokenPrefix" varchar(16) NOT NULL,
	"label" varchar(128) DEFAULT 'Railway deployment' NOT NULL,
	"liveUrl" varchar(1024),
	"notifyCount" integer DEFAULT 0 NOT NULL,
	"createdByUserId" varchar(64),
	"created_at" timestamp with time zone NOT NULL,
	"lastSeenAt" timestamp with time zone,
	"expiresAt" timestamp with time zone,
	"revokedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "atlas_deploy_token" ADD CONSTRAINT "atlas_deploy_token_machineId_atlas_machine_id_fk" FOREIGN KEY ("machineId") REFERENCES "public"."atlas_machine"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_deploy_token" ADD CONSTRAINT "atlas_deploy_token_workspaceId_atlas_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."atlas_workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_deploy_token" ADD CONSTRAINT "atlas_deploy_token_createdByUserId_atlas_user_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deploy_token_hash_idx" ON "atlas_deploy_token" USING btree ("tokenHash");--> statement-breakpoint
CREATE INDEX "deploy_token_machine_idx" ON "atlas_deploy_token" USING btree ("machineId");
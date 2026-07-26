CREATE TABLE "atlas_api_invocation" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"serviceKeyId" varchar(64) NOT NULL,
	"runId" varchar(64),
	"endpoint" varchar(128) NOT NULL,
	"statusCode" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_artifact" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"runId" varchar(64) NOT NULL,
	"name" varchar(256) NOT NULL,
	"contentType" varchar(128) DEFAULT 'text/plain' NOT NULL,
	"content" text,
	"storageKey" varchar(512),
	"bytes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_audit_event" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"groupId" varchar(64),
	"userId" varchar(64),
	"serviceKeyId" varchar(64),
	"action" varchar(64) NOT NULL,
	"detail" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_cli_token" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"userId" varchar(64) NOT NULL,
	"tokenHash" varchar(64) NOT NULL,
	"tokenPrefix" varchar(16) NOT NULL,
	"label" varchar(128) DEFAULT 'Atlas CLI' NOT NULL,
	"lastUsedAt" timestamp with time zone,
	"revokedAt" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_correction" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"specialistId" varchar(64) NOT NULL,
	"runId" varchar(64),
	"messageId" varchar(64),
	"kind" varchar(32) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"replacement" text,
	"promotedTo" varchar(16),
	"promotedAt" timestamp with time zone,
	"promotedByUserId" varchar(64),
	"createdByUserId" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_deployment" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"specialistId" varchar(64) NOT NULL,
	"specialistVersionId" varchar(64) NOT NULL,
	"evaluationRunId" varchar(64),
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"deployedByUserId" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"deprecatedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "atlas_device_code" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"userCode" varchar(16) NOT NULL,
	"deviceCodeHash" varchar(64) NOT NULL,
	"approvedUserId" varchar(64),
	"mintedTokenId" varchar(64),
	"consumedAt" timestamp with time zone,
	"deniedAt" timestamp with time zone,
	"expiresAt" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_evaluation_case" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"suiteId" varchar(64) NOT NULL,
	"name" varchar(256) NOT NULL,
	"input" jsonb NOT NULL,
	"expectation" text NOT NULL,
	"fromCorrectionId" varchar(64),
	"critical" boolean DEFAULT false NOT NULL,
	"createdByUserId" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_evaluation_run" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"suiteId" varchar(64) NOT NULL,
	"specialistVersionId" varchar(64) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"passedCases" integer DEFAULT 0 NOT NULL,
	"failedCases" integer DEFAULT 0 NOT NULL,
	"results" jsonb,
	"startedByUserId" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"finishedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "atlas_evaluation_suite" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"specialistId" varchar(64) NOT NULL,
	"name" varchar(256) NOT NULL,
	"createdByUserId" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_group" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(256) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"createdByUserId" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_invitation" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"groupId" varchar(64) NOT NULL,
	"email" varchar(320) NOT NULL,
	"role" varchar(16) NOT NULL,
	"tokenHash" varchar(64) NOT NULL,
	"invitedByUserId" varchar(64) NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"acceptedAt" timestamp with time zone,
	"revokedAt" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_membership" (
	"groupId" varchar(64) NOT NULL,
	"userId" varchar(64) NOT NULL,
	"role" varchar(16) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "atlas_membership_groupId_userId_pk" PRIMARY KEY("groupId","userId")
);
--> statement-breakpoint
CREATE TABLE "atlas_memory" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"workspaceId" varchar(64) NOT NULL,
	"specialistId" varchar(64),
	"scope" varchar(16) NOT NULL,
	"text" text NOT NULL,
	"promotedFromMemoryId" varchar(64),
	"createdByUserId" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_message" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"threadId" varchar(64) NOT NULL,
	"seq" integer NOT NULL,
	"role" varchar(16) NOT NULL,
	"authorUserId" varchar(64),
	"content" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_run_event" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"runId" varchar(64) NOT NULL,
	"seq" integer NOT NULL,
	"kind" varchar(32) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_run" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"specialistId" varchar(64) NOT NULL,
	"specialistVersionId" varchar(64) NOT NULL,
	"threadId" varchar(64),
	"runtimeId" varchar(64),
	"sourceSnapshot" jsonb,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"idempotencyKey" varchar(128),
	"startedByUserId" varchar(64),
	"serviceKeyId" varchar(64),
	"created_at" timestamp with time zone NOT NULL,
	"startedAt" timestamp with time zone,
	"finishedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "atlas_runtime" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"kind" varchar(32) DEFAULT 'local' NOT NULL,
	"status" varchar(16) DEFAULT 'provisioning' NOT NULL,
	"handle" varchar(256),
	"created_at" timestamp with time zone NOT NULL,
	"terminatedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "atlas_service_key" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"groupId" varchar(64),
	"userId" varchar(64),
	"specialistId" varchar(64) NOT NULL,
	"label" varchar(128) NOT NULL,
	"keyHash" varchar(64) NOT NULL,
	"keyPrefix" varchar(16) NOT NULL,
	"scopes" jsonb NOT NULL,
	"rateLimit" integer DEFAULT 60 NOT NULL,
	"expiresAt" timestamp with time zone,
	"createdByUserId" varchar(64) NOT NULL,
	"lastUsedAt" timestamp with time zone,
	"revokedAt" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_source_file" (
	"sourceVersionId" varchar(64) NOT NULL,
	"path" varchar(1024) NOT NULL,
	"contentHash" varchar(64) NOT NULL,
	"bytes" integer NOT NULL,
	"content" text NOT NULL,
	CONSTRAINT "atlas_source_file_sourceVersionId_path_pk" PRIMARY KEY("sourceVersionId","path")
);
--> statement-breakpoint
CREATE TABLE "atlas_source_permission" (
	"sourceId" varchar(64) NOT NULL,
	"specialistId" varchar(64) NOT NULL,
	"grantedByUserId" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "atlas_source_permission_sourceId_specialistId_pk" PRIMARY KEY("sourceId","specialistId")
);
--> statement-breakpoint
CREATE TABLE "atlas_source_version" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"sourceId" varchar(64) NOT NULL,
	"version" integer NOT NULL,
	"fileCount" integer NOT NULL,
	"totalBytes" integer NOT NULL,
	"contentHash" varchar(64) NOT NULL,
	"syncedByUserId" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_source" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"workspaceId" varchar(64) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"name" varchar(256) NOT NULL,
	"origin" varchar(1024) NOT NULL,
	"syncRules" jsonb,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"currentVersionId" varchar(64),
	"addedByUserId" varchar(64) NOT NULL,
	"revokedAt" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_specialist_version" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"specialistId" varchar(64) NOT NULL,
	"version" integer NOT NULL,
	"manifest" jsonb NOT NULL,
	"changeSummary" varchar(512),
	"createdByUserId" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_specialist" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"workspaceId" varchar(64) NOT NULL,
	"name" varchar(256) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"purpose" text NOT NULL,
	"state" varchar(16) DEFAULT 'draft' NOT NULL,
	"currentVersionId" varchar(64),
	"createdByUserId" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "atlas_thread" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"workspaceId" varchar(64) NOT NULL,
	"specialistId" varchar(64),
	"title" varchar(256) DEFAULT 'New thread' NOT NULL,
	"createdByUserId" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_tool_definition" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text NOT NULL,
	"inputSchema" jsonb NOT NULL,
	"requiresApproval" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "atlas_tool_definition_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "atlas_tool_grant" (
	"specialistId" varchar(64) NOT NULL,
	"toolId" varchar(64) NOT NULL,
	"grantedByUserId" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "atlas_tool_grant_specialistId_toolId_pk" PRIMARY KEY("specialistId","toolId")
);
--> statement-breakpoint
CREATE TABLE "atlas_user" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(256),
	"email" varchar(320) NOT NULL,
	"image" varchar(512),
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "atlas_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "atlas_workspace" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(256) NOT NULL,
	"userId" varchar(64),
	"groupId" varchar(64),
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atlas_api_invocation" ADD CONSTRAINT "atlas_api_invocation_serviceKeyId_atlas_service_key_id_fk" FOREIGN KEY ("serviceKeyId") REFERENCES "public"."atlas_service_key"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_artifact" ADD CONSTRAINT "atlas_artifact_runId_atlas_run_id_fk" FOREIGN KEY ("runId") REFERENCES "public"."atlas_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_cli_token" ADD CONSTRAINT "atlas_cli_token_userId_atlas_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."atlas_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_correction" ADD CONSTRAINT "atlas_correction_specialistId_atlas_specialist_id_fk" FOREIGN KEY ("specialistId") REFERENCES "public"."atlas_specialist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_correction" ADD CONSTRAINT "atlas_correction_promotedByUserId_atlas_user_id_fk" FOREIGN KEY ("promotedByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_correction" ADD CONSTRAINT "atlas_correction_createdByUserId_atlas_user_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_deployment" ADD CONSTRAINT "atlas_deployment_specialistId_atlas_specialist_id_fk" FOREIGN KEY ("specialistId") REFERENCES "public"."atlas_specialist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_deployment" ADD CONSTRAINT "atlas_deployment_specialistVersionId_atlas_specialist_version_id_fk" FOREIGN KEY ("specialistVersionId") REFERENCES "public"."atlas_specialist_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_deployment" ADD CONSTRAINT "atlas_deployment_deployedByUserId_atlas_user_id_fk" FOREIGN KEY ("deployedByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_evaluation_case" ADD CONSTRAINT "atlas_evaluation_case_suiteId_atlas_evaluation_suite_id_fk" FOREIGN KEY ("suiteId") REFERENCES "public"."atlas_evaluation_suite"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_evaluation_case" ADD CONSTRAINT "atlas_evaluation_case_createdByUserId_atlas_user_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_evaluation_run" ADD CONSTRAINT "atlas_evaluation_run_suiteId_atlas_evaluation_suite_id_fk" FOREIGN KEY ("suiteId") REFERENCES "public"."atlas_evaluation_suite"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_evaluation_run" ADD CONSTRAINT "atlas_evaluation_run_specialistVersionId_atlas_specialist_version_id_fk" FOREIGN KEY ("specialistVersionId") REFERENCES "public"."atlas_specialist_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_evaluation_run" ADD CONSTRAINT "atlas_evaluation_run_startedByUserId_atlas_user_id_fk" FOREIGN KEY ("startedByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_evaluation_suite" ADD CONSTRAINT "atlas_evaluation_suite_specialistId_atlas_specialist_id_fk" FOREIGN KEY ("specialistId") REFERENCES "public"."atlas_specialist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_evaluation_suite" ADD CONSTRAINT "atlas_evaluation_suite_createdByUserId_atlas_user_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_group" ADD CONSTRAINT "atlas_group_createdByUserId_atlas_user_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_invitation" ADD CONSTRAINT "atlas_invitation_groupId_atlas_group_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."atlas_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_invitation" ADD CONSTRAINT "atlas_invitation_invitedByUserId_atlas_user_id_fk" FOREIGN KEY ("invitedByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_membership" ADD CONSTRAINT "atlas_membership_groupId_atlas_group_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."atlas_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_membership" ADD CONSTRAINT "atlas_membership_userId_atlas_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."atlas_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_memory" ADD CONSTRAINT "atlas_memory_workspaceId_atlas_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."atlas_workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_memory" ADD CONSTRAINT "atlas_memory_specialistId_atlas_specialist_id_fk" FOREIGN KEY ("specialistId") REFERENCES "public"."atlas_specialist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_memory" ADD CONSTRAINT "atlas_memory_createdByUserId_atlas_user_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_message" ADD CONSTRAINT "atlas_message_threadId_atlas_thread_id_fk" FOREIGN KEY ("threadId") REFERENCES "public"."atlas_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_message" ADD CONSTRAINT "atlas_message_authorUserId_atlas_user_id_fk" FOREIGN KEY ("authorUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_run_event" ADD CONSTRAINT "atlas_run_event_runId_atlas_run_id_fk" FOREIGN KEY ("runId") REFERENCES "public"."atlas_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_run" ADD CONSTRAINT "atlas_run_specialistId_atlas_specialist_id_fk" FOREIGN KEY ("specialistId") REFERENCES "public"."atlas_specialist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_run" ADD CONSTRAINT "atlas_run_specialistVersionId_atlas_specialist_version_id_fk" FOREIGN KEY ("specialistVersionId") REFERENCES "public"."atlas_specialist_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_run" ADD CONSTRAINT "atlas_run_threadId_atlas_thread_id_fk" FOREIGN KEY ("threadId") REFERENCES "public"."atlas_thread"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_run" ADD CONSTRAINT "atlas_run_runtimeId_atlas_runtime_id_fk" FOREIGN KEY ("runtimeId") REFERENCES "public"."atlas_runtime"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_run" ADD CONSTRAINT "atlas_run_startedByUserId_atlas_user_id_fk" FOREIGN KEY ("startedByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_service_key" ADD CONSTRAINT "atlas_service_key_groupId_atlas_group_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."atlas_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_service_key" ADD CONSTRAINT "atlas_service_key_userId_atlas_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."atlas_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_service_key" ADD CONSTRAINT "atlas_service_key_specialistId_atlas_specialist_id_fk" FOREIGN KEY ("specialistId") REFERENCES "public"."atlas_specialist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_service_key" ADD CONSTRAINT "atlas_service_key_createdByUserId_atlas_user_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_source_file" ADD CONSTRAINT "atlas_source_file_sourceVersionId_atlas_source_version_id_fk" FOREIGN KEY ("sourceVersionId") REFERENCES "public"."atlas_source_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_source_permission" ADD CONSTRAINT "atlas_source_permission_sourceId_atlas_source_id_fk" FOREIGN KEY ("sourceId") REFERENCES "public"."atlas_source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_source_permission" ADD CONSTRAINT "atlas_source_permission_specialistId_atlas_specialist_id_fk" FOREIGN KEY ("specialistId") REFERENCES "public"."atlas_specialist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_source_permission" ADD CONSTRAINT "atlas_source_permission_grantedByUserId_atlas_user_id_fk" FOREIGN KEY ("grantedByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_source_version" ADD CONSTRAINT "atlas_source_version_sourceId_atlas_source_id_fk" FOREIGN KEY ("sourceId") REFERENCES "public"."atlas_source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_source_version" ADD CONSTRAINT "atlas_source_version_syncedByUserId_atlas_user_id_fk" FOREIGN KEY ("syncedByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_source" ADD CONSTRAINT "atlas_source_workspaceId_atlas_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."atlas_workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_source" ADD CONSTRAINT "atlas_source_addedByUserId_atlas_user_id_fk" FOREIGN KEY ("addedByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_specialist_version" ADD CONSTRAINT "atlas_specialist_version_specialistId_atlas_specialist_id_fk" FOREIGN KEY ("specialistId") REFERENCES "public"."atlas_specialist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_specialist_version" ADD CONSTRAINT "atlas_specialist_version_createdByUserId_atlas_user_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_specialist" ADD CONSTRAINT "atlas_specialist_workspaceId_atlas_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."atlas_workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_specialist" ADD CONSTRAINT "atlas_specialist_createdByUserId_atlas_user_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_thread" ADD CONSTRAINT "atlas_thread_workspaceId_atlas_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."atlas_workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_thread" ADD CONSTRAINT "atlas_thread_specialistId_atlas_specialist_id_fk" FOREIGN KEY ("specialistId") REFERENCES "public"."atlas_specialist"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_thread" ADD CONSTRAINT "atlas_thread_createdByUserId_atlas_user_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_tool_grant" ADD CONSTRAINT "atlas_tool_grant_specialistId_atlas_specialist_id_fk" FOREIGN KEY ("specialistId") REFERENCES "public"."atlas_specialist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_tool_grant" ADD CONSTRAINT "atlas_tool_grant_toolId_atlas_tool_definition_id_fk" FOREIGN KEY ("toolId") REFERENCES "public"."atlas_tool_definition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_tool_grant" ADD CONSTRAINT "atlas_tool_grant_grantedByUserId_atlas_user_id_fk" FOREIGN KEY ("grantedByUserId") REFERENCES "public"."atlas_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_workspace" ADD CONSTRAINT "atlas_workspace_userId_atlas_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."atlas_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_workspace" ADD CONSTRAINT "atlas_workspace_groupId_atlas_group_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."atlas_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_invocation_key_idx" ON "atlas_api_invocation" USING btree ("serviceKeyId","created_at");--> statement-breakpoint
CREATE INDEX "artifact_run_idx" ON "atlas_artifact" USING btree ("runId");--> statement-breakpoint
CREATE INDEX "audit_group_idx" ON "atlas_audit_event" USING btree ("groupId","created_at");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "atlas_audit_event" USING btree ("action");--> statement-breakpoint
CREATE UNIQUE INDEX "cli_token_hash_idx" ON "atlas_cli_token" USING btree ("tokenHash");--> statement-breakpoint
CREATE INDEX "cli_token_user_idx" ON "atlas_cli_token" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "correction_specialist_idx" ON "atlas_correction" USING btree ("specialistId");--> statement-breakpoint
CREATE INDEX "deployment_specialist_idx" ON "atlas_deployment" USING btree ("specialistId");--> statement-breakpoint
CREATE UNIQUE INDEX "device_code_hash_idx" ON "atlas_device_code" USING btree ("deviceCodeHash");--> statement-breakpoint
CREATE UNIQUE INDEX "device_code_user_idx" ON "atlas_device_code" USING btree ("userCode");--> statement-breakpoint
CREATE INDEX "eval_case_suite_idx" ON "atlas_evaluation_case" USING btree ("suiteId");--> statement-breakpoint
CREATE INDEX "eval_run_version_idx" ON "atlas_evaluation_run" USING btree ("specialistVersionId");--> statement-breakpoint
CREATE INDEX "eval_suite_specialist_idx" ON "atlas_evaluation_suite" USING btree ("specialistId");--> statement-breakpoint
CREATE UNIQUE INDEX "group_slug_idx" ON "atlas_group" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_token_idx" ON "atlas_invitation" USING btree ("tokenHash");--> statement-breakpoint
CREATE INDEX "invitation_group_idx" ON "atlas_invitation" USING btree ("groupId");--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "atlas_membership" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "memory_workspace_idx" ON "atlas_memory" USING btree ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "message_thread_seq_idx" ON "atlas_message" USING btree ("threadId","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "run_event_seq_idx" ON "atlas_run_event" USING btree ("runId","seq");--> statement-breakpoint
CREATE INDEX "run_specialist_idx" ON "atlas_run" USING btree ("specialistId","created_at");--> statement-breakpoint
CREATE INDEX "run_status_idx" ON "atlas_run" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "run_idempotency_idx" ON "atlas_run" USING btree ("specialistId","idempotencyKey");--> statement-breakpoint
CREATE UNIQUE INDEX "service_key_hash_idx" ON "atlas_service_key" USING btree ("keyHash");--> statement-breakpoint
CREATE INDEX "service_key_specialist_idx" ON "atlas_service_key" USING btree ("specialistId");--> statement-breakpoint
CREATE UNIQUE INDEX "source_version_idx" ON "atlas_source_version" USING btree ("sourceId","version");--> statement-breakpoint
CREATE INDEX "source_workspace_idx" ON "atlas_source" USING btree ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "specialist_version_idx" ON "atlas_specialist_version" USING btree ("specialistId","version");--> statement-breakpoint
CREATE INDEX "specialist_workspace_idx" ON "atlas_specialist" USING btree ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "specialist_slug_idx" ON "atlas_specialist" USING btree ("workspaceId","slug");--> statement-breakpoint
CREATE INDEX "thread_workspace_idx" ON "atlas_thread" USING btree ("workspaceId");--> statement-breakpoint
CREATE INDEX "workspace_user_idx" ON "atlas_workspace" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "workspace_group_idx" ON "atlas_workspace" USING btree ("groupId");
CREATE TABLE "atlas_device" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"userId" varchar(64) NOT NULL,
	"installationId" varchar(128),
	"kind" varchar(16) NOT NULL,
	"label" varchar(128) NOT NULL,
	"platform" varchar(64),
	"appVersion" varchar(32),
	"lastSeenAt" timestamp with time zone,
	"revokedAt" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atlas_audit_event" ADD COLUMN "deviceId" varchar(64);--> statement-breakpoint
ALTER TABLE "atlas_cli_token" ADD COLUMN "deviceId" varchar(64);--> statement-breakpoint
ALTER TABLE "atlas_device_code" ADD COLUMN "installationId" varchar(128);--> statement-breakpoint
ALTER TABLE "atlas_device_code" ADD COLUMN "deviceKind" varchar(16);--> statement-breakpoint
ALTER TABLE "atlas_device_code" ADD COLUMN "deviceLabel" varchar(128);--> statement-breakpoint
ALTER TABLE "atlas_device_code" ADD COLUMN "devicePlatform" varchar(64);--> statement-breakpoint
ALTER TABLE "atlas_device_code" ADD COLUMN "deviceAppVersion" varchar(32);--> statement-breakpoint
ALTER TABLE "atlas_device" ADD CONSTRAINT "atlas_device_userId_atlas_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."atlas_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_user_idx" ON "atlas_device" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "device_installation_idx" ON "atlas_device" USING btree ("userId","installationId");--> statement-breakpoint
ALTER TABLE "atlas_cli_token" ADD CONSTRAINT "atlas_cli_token_deviceId_atlas_device_id_fk" FOREIGN KEY ("deviceId") REFERENCES "public"."atlas_device"("id") ON DELETE set null ON UPDATE no action;
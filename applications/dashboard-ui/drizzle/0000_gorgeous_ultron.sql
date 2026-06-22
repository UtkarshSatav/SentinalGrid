CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`source` text NOT NULL,
	`severity` text NOT NULL,
	`src_ip` text,
	`src_country` text,
	`src_asn` integer,
	`src_org` text,
	`method` text,
	`path` text,
	`status_code` integer,
	`user_agent` text,
	`ua_browser` text,
	`ua_os` text,
	`ua_bot` integer,
	`threat_score` integer,
	`ti_matches` text,
	`mitre_tids` text,
	`raw` text,
	`ingested_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_site_time_idx` ON `events` (`site_id`,`ingested_at`);--> statement-breakpoint
CREATE INDEX `events_threat_idx` ON `events` (`site_id`,`threat_score`);--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`site_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`title` text NOT NULL,
	`severity` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`rule_id` text,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`event_count` integer DEFAULT 1 NOT NULL,
	`assignee` text,
	`playbook` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inc_site_idx` ON `incidents` (`site_id`,`status`);--> statement-breakpoint
CREATE INDEX `inc_fingerprint_idx` ON `incidents` (`site_id`,`fingerprint`,`status`);--> statement-breakpoint
CREATE TABLE `ingest_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`label` text DEFAULT 'default' NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `keys_site_idx` ON `ingest_keys` (`site_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`incident_id` text,
	`channel` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`severity` text NOT NULL,
	`read` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notif_org_idx` ON `notifications` (`org_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `orgs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `probes` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`latency_ms` integer,
	`status_code` integer,
	`details` text,
	`observed_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `probes_site_time_idx` ON `probes` (`site_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`hostname` text NOT NULL,
	`probe_interval_sec` integer DEFAULT 60 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`slack_webhook_url` text,
	`last_probe_at` integer,
	`last_status` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sites_org_idx` ON `sites` (`org_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`role` text DEFAULT 'admin' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
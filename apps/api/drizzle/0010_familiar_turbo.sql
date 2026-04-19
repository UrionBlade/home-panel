CREATE TABLE `calendar_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`type` text DEFAULT 'ics' NOT NULL,
	`color` text DEFAULT '#4A90D9' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_sync_at` text,
	`last_sync_error` text,
	`sync_interval_minutes` integer DEFAULT 30 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `events` ADD `source_id` text REFERENCES calendar_sources(id);--> statement-breakpoint
ALTER TABLE `events` ADD `external_id` text;
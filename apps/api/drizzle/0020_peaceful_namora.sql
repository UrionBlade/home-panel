CREATE TABLE `lights` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`room` text,
	`provider` text NOT NULL,
	`device_id` text NOT NULL,
	`last_state` text DEFAULT 'unknown' NOT NULL,
	`last_seen_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `provider_credentials` (
	`provider` text PRIMARY KEY NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);

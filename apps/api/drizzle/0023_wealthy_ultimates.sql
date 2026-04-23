CREATE TABLE `ge_credentials` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`email` text,
	`access_token` text,
	`refresh_token` text,
	`expires_at` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ge_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`serial` text NOT NULL,
	`model` text,
	`nickname` text,
	`room_id` text,
	`last_state` text,
	`last_seen_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);

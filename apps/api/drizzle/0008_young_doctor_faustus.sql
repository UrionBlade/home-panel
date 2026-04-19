CREATE TABLE `blink_cameras` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`network_id` text,
	`model` text,
	`serial_number` text,
	`firmware_version` text,
	`status` text DEFAULT 'online' NOT NULL,
	`battery_level` text,
	`thumbnail_url` text,
	`last_motion_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `blink_credentials` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`email` text,
	`encrypted_password` text,
	`encrypted_token` text,
	`account_id` text,
	`region` text DEFAULT 'u014',
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `blink_motion_clips` (
	`id` text PRIMARY KEY NOT NULL,
	`camera_id` text NOT NULL,
	`recorded_at` text NOT NULL,
	`duration_seconds` integer,
	`thumbnail_path` text,
	`clip_path` text,
	`viewed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`camera_id`) REFERENCES `blink_cameras`(`id`) ON UPDATE no action ON DELETE cascade
);

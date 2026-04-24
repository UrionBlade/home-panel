CREATE TABLE `ip_camera_recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`camera_id` text NOT NULL,
	`file_path` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`duration_seconds` integer,
	`size_bytes` integer,
	`label` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);

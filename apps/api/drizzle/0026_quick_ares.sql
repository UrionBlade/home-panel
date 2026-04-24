CREATE TABLE `ip_cameras` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`port` integer DEFAULT 554 NOT NULL,
	`username` text,
	`password` text,
	`stream_path` text DEFAULT '/11' NOT NULL,
	`substream_path` text DEFAULT '/12',
	`room_id` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);

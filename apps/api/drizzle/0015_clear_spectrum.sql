CREATE TABLE `smartthings_config` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`pat` text,
	`washer_device_id` text,
	`dryer_device_id` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);

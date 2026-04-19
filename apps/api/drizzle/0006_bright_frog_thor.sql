CREATE TABLE `kiosk_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`night_mode_enabled` integer DEFAULT true NOT NULL,
	`night_start_hour` integer DEFAULT 22 NOT NULL,
	`night_end_hour` integer DEFAULT 7 NOT NULL,
	`night_brightness` real DEFAULT 0.25 NOT NULL,
	`screensaver_enabled` integer DEFAULT true NOT NULL,
	`screensaver_idle_minutes` integer DEFAULT 5 NOT NULL,
	`photos_dir` text DEFAULT '/data/photos' NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);

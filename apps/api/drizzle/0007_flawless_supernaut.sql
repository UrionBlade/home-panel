CREATE TABLE `voice_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`sensitivity` real DEFAULT 0.5 NOT NULL,
	`preferred_tts_voice` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);

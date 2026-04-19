CREATE TABLE `spotify_credentials` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`expires_at` text,
	`display_name` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);

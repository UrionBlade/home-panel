CREATE TABLE `weather_cache` (
	`location_id` text PRIMARY KEY NOT NULL,
	`fetched_at` text NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `weather_locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `weather_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);

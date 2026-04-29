CREATE TABLE `env_sensor_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sensor_id` text NOT NULL,
	`recorded_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`co2_ppm` real,
	`pm25` real,
	`temp_c` real,
	`humidity_pct` real,
	FOREIGN KEY (`sensor_id`) REFERENCES `env_sensors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `env_history_sensor_recorded_idx` ON `env_sensor_history` (`sensor_id`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `env_sensors` (
	`id` text PRIMARY KEY NOT NULL,
	`dirigera_id` text NOT NULL,
	`kind` text NOT NULL,
	`friendly_name` text NOT NULL,
	`room_id` text,
	`last_co2_ppm` real,
	`last_pm25` real,
	`last_temp_c` real,
	`last_humidity_pct` real,
	`last_battery_pct` integer,
	`last_seen` text,
	`offline` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `env_sensors_dirigera_id_unique` ON `env_sensors` (`dirigera_id`);--> statement-breakpoint
CREATE TABLE `leak_sensors` (
	`id` text PRIMARY KEY NOT NULL,
	`dirigera_id` text NOT NULL,
	`friendly_name` text NOT NULL,
	`room_id` text,
	`leak_detected` integer DEFAULT false NOT NULL,
	`battery_pct` integer,
	`last_seen` text,
	`last_ack_at` text,
	`offline` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leak_sensors_dirigera_id_unique` ON `leak_sensors` (`dirigera_id`);
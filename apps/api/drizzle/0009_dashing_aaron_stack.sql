CREATE TABLE `alarms` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`hour` integer NOT NULL,
	`minute` integer NOT NULL,
	`days_of_week` text DEFAULT '[]' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sound` text DEFAULT 'default' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);

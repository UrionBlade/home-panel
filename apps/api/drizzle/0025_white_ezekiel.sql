CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`color` text,
	`enabled` integer DEFAULT true NOT NULL,
	`trigger_type` text DEFAULT 'manual' NOT NULL,
	`trigger_config` text DEFAULT '{}' NOT NULL,
	`voice_response` text,
	`steps` text DEFAULT '[]' NOT NULL,
	`last_run_at` text,
	`last_run_status` text,
	`last_run_error` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);

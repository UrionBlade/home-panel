CREATE TABLE `alarm_events` (
	`id` text PRIMARY KEY NOT NULL,
	`ieee_address` text NOT NULL,
	`friendly_name` text NOT NULL,
	`kind` text NOT NULL,
	`triggered_at` text NOT NULL,
	`acknowledged_at` text,
	`payload` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `alarm_state` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`armed` integer DEFAULT false NOT NULL,
	`armed_at` text,
	`mode` text DEFAULT 'away' NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `zigbee_devices` ADD `armed` integer DEFAULT true NOT NULL;
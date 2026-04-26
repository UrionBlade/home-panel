CREATE TABLE `zigbee_devices` (
	`ieee_address` text PRIMARY KEY NOT NULL,
	`friendly_name` text NOT NULL,
	`vendor` text,
	`model` text,
	`description` text,
	`type` text,
	`last_state_json` text DEFAULT '{}' NOT NULL,
	`battery` integer,
	`link_quality` integer,
	`availability` text DEFAULT 'unknown' NOT NULL,
	`last_seen_at` text,
	`room_id` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);

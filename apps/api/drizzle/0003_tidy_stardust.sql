CREATE TABLE `waste_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`waste_type_id` text NOT NULL,
	`original_date` text,
	`replacement_date` text,
	`reason` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`waste_type_id`) REFERENCES `waste_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `waste_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`waste_type_id` text NOT NULL,
	`pattern` text NOT NULL,
	`exposition_time` text DEFAULT '20:00' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`waste_type_id`) REFERENCES `waste_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `waste_types` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`color` text NOT NULL,
	`icon` text NOT NULL,
	`container_type` text NOT NULL,
	`exposition_instructions` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);

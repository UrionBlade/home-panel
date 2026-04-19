CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`source_url` text,
	`source_name` text,
	`image_url` text,
	`prep_time_minutes` integer,
	`cook_time_minutes` integer,
	`servings` integer,
	`difficulty` text,
	`ingredients` text DEFAULT '[]' NOT NULL,
	`steps` text DEFAULT '[]' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`favorite` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);

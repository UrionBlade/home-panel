CREATE TABLE `event_attendees` (
	`event_id` text NOT NULL,
	`family_member_id` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`family_member_id`) REFERENCES `family_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `event_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`icon` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`all_day` integer DEFAULT false NOT NULL,
	`location` text,
	`category_id` text,
	`recurrence_rule` text,
	`reminder_minutes` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `event_categories`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `family_members` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`accent_color` text,
	`birth_date` text,
	`role` text,
	`species` text,
	`breed` text,
	`weight_kg` real,
	`veterinary_notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);

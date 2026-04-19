CREATE TABLE `postits` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`body` text,
	`color` text NOT NULL,
	`pos_x` real DEFAULT 0.5 NOT NULL,
	`pos_y` real DEFAULT 0.5 NOT NULL,
	`rotation` real DEFAULT 0 NOT NULL,
	`z_index` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);

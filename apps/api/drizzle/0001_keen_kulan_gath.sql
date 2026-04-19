CREATE TABLE `product_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`default_unit` text DEFAULT 'pz' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_catalog_name_unique` ON `product_catalog` (`name`);--> statement-breakpoint
CREATE TABLE `shopping_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`quantity` text DEFAULT '1' NOT NULL,
	`unit` text DEFAULT 'pz' NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`added_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`added_by` text,
	`audit_log` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`added_by`) REFERENCES `family_members`(`id`) ON UPDATE no action ON DELETE set null
);

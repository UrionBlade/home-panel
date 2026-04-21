ALTER TABLE `blink_cameras` ADD `device_type` text DEFAULT 'camera' NOT NULL;--> statement-breakpoint
ALTER TABLE `blink_cameras` ADD `enabled` integer DEFAULT true NOT NULL;
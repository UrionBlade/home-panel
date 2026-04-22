ALTER TABLE `blink_cameras` ADD `room_id` text;--> statement-breakpoint
ALTER TABLE `lights` ADD `room_id` text;--> statement-breakpoint
ALTER TABLE `smartthings_config` ADD `washer_room_id` text;--> statement-breakpoint
ALTER TABLE `smartthings_config` ADD `dryer_room_id` text;--> statement-breakpoint
ALTER TABLE `smartthings_config` ADD `tv_room_id` text;
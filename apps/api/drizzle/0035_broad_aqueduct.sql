ALTER TABLE `alarm_state` ADD `disarm_code_hash` text;--> statement-breakpoint
ALTER TABLE `blink_cameras` ADD `armed_for_alarm` integer DEFAULT false NOT NULL;
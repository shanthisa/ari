CREATE TABLE `event_quick_tags` (
	`event_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`event_id`, `tag_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `event_quick_tags_event_idx` ON `event_quick_tags` (`event_id`);--> statement-breakpoint
CREATE INDEX `event_quick_tags_tag_idx` ON `event_quick_tags` (`tag_id`);
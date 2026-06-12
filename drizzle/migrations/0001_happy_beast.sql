CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tags_owner_idx` ON `tags` (`org_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_owner_name_unq` ON `tags` (`org_id`,`user_id`,`name`);
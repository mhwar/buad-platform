CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`link` text DEFAULT '' NOT NULL,
	`dedupe_key` text DEFAULT '' NOT NULL,
	`read_at` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notif_user` ON `notifications` (`user_id`,`read_at`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_notif_dedupe` ON `notifications` (`user_id`,`dedupe_key`) WHERE dedupe_key <> '';
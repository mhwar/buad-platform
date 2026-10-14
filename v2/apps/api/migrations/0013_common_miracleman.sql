CREATE TABLE `site_publishes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`content` text NOT NULL,
	`published_at` integer DEFAULT (unixepoch()) NOT NULL,
	`published_by` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_site_publishes_org` ON `site_publishes` (`org_id`,`published_at`);
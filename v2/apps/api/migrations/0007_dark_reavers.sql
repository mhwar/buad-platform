CREATE TABLE `distribution_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`distribution_id` text NOT NULL,
	`project_id` text NOT NULL,
	`amount_halalas` integer NOT NULL,
	FOREIGN KEY (`distribution_id`) REFERENCES `distributions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_distribution_projects_d` ON `distribution_projects` (`distribution_id`);--> statement-breakpoint
CREATE INDEX `idx_distribution_projects_p` ON `distribution_projects` (`project_id`);--> statement-breakpoint
CREATE TABLE `project_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`date` text NOT NULL,
	`amount_halalas` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_receipts_project` ON `project_receipts` (`project_id`,`date`);
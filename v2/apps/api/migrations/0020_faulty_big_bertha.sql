CREATE TABLE `payment_schedule` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`label` text NOT NULL,
	`due_date` text NOT NULL,
	`amount_halalas` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`receipt_id` text DEFAULT '' NOT NULL,
	`received_at` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sched_org` ON `payment_schedule` (`org_id`,`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `idx_sched_project` ON `payment_schedule` (`project_id`);
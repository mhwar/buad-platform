CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`title` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`owner_id` text DEFAULT '' NOT NULL,
	`due_date` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`meeting_id` text DEFAULT '' NOT NULL,
	`project_id` text DEFAULT '' NOT NULL,
	`task_id` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_decisions_org` ON `decisions` (`org_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_decisions_owner` ON `decisions` (`owner_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_decisions_meeting` ON `decisions` (`meeting_id`);--> statement-breakpoint
CREATE TABLE `meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`title` text NOT NULL,
	`starts_at` text NOT NULL,
	`duration_min` integer DEFAULT 60 NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`attendee_ids` text DEFAULT '[]' NOT NULL,
	`client_id` text DEFAULT '' NOT NULL,
	`request_id` text DEFAULT '' NOT NULL,
	`project_id` text DEFAULT '' NOT NULL,
	`agenda` text DEFAULT '' NOT NULL,
	`minutes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`activity_id` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_meetings_org` ON `meetings` (`org_id`,`starts_at`);
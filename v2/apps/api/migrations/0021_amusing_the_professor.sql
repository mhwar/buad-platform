CREATE TABLE `crm_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`client_id` text NOT NULL,
	`request_id` text DEFAULT '' NOT NULL,
	`type` text NOT NULL,
	`summary` text NOT NULL,
	`at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_by_name` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_crm_client` ON `crm_activities` (`client_id`,`at`);--> statement-breakpoint
CREATE INDEX `idx_crm_org` ON `crm_activities` (`org_id`,`at`);--> statement-breakpoint
ALTER TABLE `clients` ADD `owner_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `source` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `next_follow_up_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `last_contact_at` integer DEFAULT 0 NOT NULL;
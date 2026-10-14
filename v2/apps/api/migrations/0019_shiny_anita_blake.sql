CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`number` text NOT NULL,
	`request_id` text DEFAULT '' NOT NULL,
	`client_id` text DEFAULT '' NOT NULL,
	`recipient` text DEFAULT '' NOT NULL,
	`entity` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`items` text DEFAULT '[]' NOT NULL,
	`discount_halalas` integer DEFAULT 0 NOT NULL,
	`vat_pct` real DEFAULT 15 NOT NULL,
	`valid_until` text DEFAULT '' NOT NULL,
	`terms` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_quotes_number` ON `quotes` (`org_id`,`number`);--> statement-breakpoint
CREATE INDEX `idx_quotes_org` ON `quotes` (`org_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_quotes_request` ON `quotes` (`request_id`);
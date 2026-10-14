CREATE TABLE `company_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`type` text NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`date` text DEFAULT '' NOT NULL,
	`payment_date` text DEFAULT '' NOT NULL,
	`description` text NOT NULL,
	`amount_halalas` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_company_entries_org` ON `company_entries` (`org_id`,`type`,`date`);--> statement-breakpoint
CREATE TABLE `distribution_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`distribution_id` text NOT NULL,
	`partner_id` text DEFAULT '' NOT NULL,
	`partner_name` text NOT NULL,
	`share_pct` real NOT NULL,
	`amount_halalas` integer NOT NULL,
	FOREIGN KEY (`distribution_id`) REFERENCES `distributions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_distribution_shares` ON `distribution_shares` (`distribution_id`);--> statement-breakpoint
CREATE TABLE `distributions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`period_type` text DEFAULT 'quarter' NOT NULL,
	`period_label` text DEFAULT '' NOT NULL,
	`from_date` text DEFAULT '' NOT NULL,
	`to_date` text DEFAULT '' NOT NULL,
	`gross_income_halalas` integer DEFAULT 0 NOT NULL,
	`gross_expenses_halalas` integer DEFAULT 0 NOT NULL,
	`net_profit_halalas` integer DEFAULT 0 NOT NULL,
	`distribution_pct` real DEFAULT 100 NOT NULL,
	`distributed_halalas` integer DEFAULT 0 NOT NULL,
	`retained_halalas` integer DEFAULT 0 NOT NULL,
	`retained_category` text,
	`project_ids` text DEFAULT '[]' NOT NULL,
	`project_id` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`completed_at` integer,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_distributions_org` ON `distributions` (`org_id`,`status`);--> statement-breakpoint
CREATE TABLE `partners` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`share_pct` real DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_partners_org` ON `partners` (`org_id`);
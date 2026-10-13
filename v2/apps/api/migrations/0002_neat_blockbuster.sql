CREATE TABLE `finance_budget_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`amount_halalas` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_budget_project` ON `finance_budget_items` (`project_id`,`sort`);--> statement-breakpoint
CREATE TABLE `finance_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`label` text NOT NULL,
	`type` text DEFAULT 'expense' NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_categories_project` ON `finance_categories` (`project_id`);--> statement-breakpoint
CREATE TABLE `finance_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`date` text DEFAULT '' NOT NULL,
	`description` text NOT NULL,
	`cat` text DEFAULT 'other' NOT NULL,
	`type` text NOT NULL,
	`amount_halalas` integer NOT NULL,
	`profit_margin` real DEFAULT 0 NOT NULL,
	`profit_margin_type` text DEFAULT 'pct' NOT NULL,
	`status` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_entries_project` ON `finance_entries` (`project_id`,`date`);--> statement-breakpoint
CREATE TABLE `project_finance` (
	`project_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`contract_no` text DEFAULT '' NOT NULL,
	`contract_date` text DEFAULT '' NOT NULL,
	`contract_value_halalas` integer DEFAULT 0 NOT NULL,
	`cv_locked` integer DEFAULT false NOT NULL,
	`vat_included` integer DEFAULT false NOT NULL,
	`vat_pct` real DEFAULT 15 NOT NULL,
	`exec_v` real DEFAULT 0 NOT NULL,
	`exec_type` text DEFAULT 'pct' NOT NULL,
	`exec_base` text DEFAULT 'net' NOT NULL,
	`mkt_v` real DEFAULT 0 NOT NULL,
	`mkt_type` text DEFAULT 'pct' NOT NULL,
	`mkt_base` text DEFAULT 'net' NOT NULL,
	`mkt_internal` integer DEFAULT false NOT NULL,
	`cb_v` real DEFAULT 0 NOT NULL,
	`cb_type` text DEFAULT 'pct' NOT NULL,
	`cb_base` text DEFAULT 'net' NOT NULL,
	`cf_v` real DEFAULT 0 NOT NULL,
	`cf_type` text DEFAULT 'pct' NOT NULL,
	`cf_base` text DEFAULT 'net' NOT NULL,
	`op_cats` text DEFAULT '[]' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);

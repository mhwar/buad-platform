CREATE TABLE `client_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`is_signatory` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_contacts_client` ON `client_contacts` (`client_id`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`name_norm` text DEFAULT '' NOT NULL,
	`type` text DEFAULT 'company' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`reg_no` text DEFAULT '' NOT NULL,
	`tax_no` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`logo` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_clients_code` ON `clients` (`org_id`,`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_clients_reg` ON `clients` (`org_id`,`reg_no`) WHERE reg_no <> '';--> statement-breakpoint
CREATE UNIQUE INDEX `uq_clients_tax` ON `clients` (`org_id`,`tax_no`) WHERE tax_no <> '';--> statement-breakpoint
CREATE INDEX `idx_clients_org` ON `clients` (`org_id`,`archived_at`);--> statement-breakpoint
CREATE TABLE `org_counters` (
	`org_id` text NOT NULL,
	`kind` text NOT NULL,
	`year` integer DEFAULT 0 NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`org_id`, `kind`, `year`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`client_id` text NOT NULL,
	`number` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'other' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`owner_id` text DEFAULT '' NOT NULL,
	`visibility` text DEFAULT 'team' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`start_date` text DEFAULT '' NOT NULL,
	`end_date` text DEFAULT '' NOT NULL,
	`pay_date` text DEFAULT '' NOT NULL,
	`expected_value_halalas` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`archived_at` integer,
	`archived_with` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_projects_number` ON `projects` (`org_id`,`number`);--> statement-breakpoint
CREATE INDEX `idx_projects_client` ON `projects` (`org_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `idx_projects_status` ON `projects` (`org_id`,`status`);
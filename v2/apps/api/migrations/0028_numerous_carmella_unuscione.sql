CREATE TABLE `sales_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`receipt_id` text DEFAULT '' NOT NULL,
	`number` text DEFAULT '' NOT NULL,
	`date` text NOT NULL,
	`amount_halalas` integer NOT NULL,
	`vat_halalas` integer NOT NULL,
	`asset_id` text DEFAULT '' NOT NULL,
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
CREATE INDEX `idx_sales_invoices_org` ON `sales_invoices` (`org_id`,`date`);--> statement-breakpoint
CREATE TABLE `vat_filings` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`period_key` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`output_vat_halalas` integer DEFAULT 0 NOT NULL,
	`input_vat_halalas` integer DEFAULT 0 NOT NULL,
	`net_halalas` integer DEFAULT 0 NOT NULL,
	`filed_on` text DEFAULT '' NOT NULL,
	`paid_on` text DEFAULT '' NOT NULL,
	`paid_amount_halalas` integer DEFAULT 0 NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_vat_filings_period` ON `vat_filings` (`org_id`,`period_key`);--> statement-breakpoint
ALTER TABLE `company_entries` ADD `tax_invoice` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `company_entries` ADD `vat_amount_halalas` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `company_entries` ADD `supplier_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `company_entries` ADD `supplier_vat_no` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `company_entries` ADD `invoice_no` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `company_entries` ADD `invoice_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_entries` ADD `cf_kind` text DEFAULT '' NOT NULL;
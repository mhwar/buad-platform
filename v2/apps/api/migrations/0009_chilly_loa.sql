CREATE TABLE `org_vat_settings` (
	`org_id` text PRIMARY KEY NOT NULL,
	`rate` real DEFAULT 15 NOT NULL,
	`period` text DEFAULT 'quarterly' NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `finance_entries` ADD `tax_invoice` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_entries` ADD `vat_amount_halalas` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_entries` ADD `supplier_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_entries` ADD `supplier_vat_no` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_entries` ADD `invoice_no` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_entries` ADD `invoice_date` text DEFAULT '' NOT NULL;
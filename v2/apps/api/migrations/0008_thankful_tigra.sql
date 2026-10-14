ALTER TABLE `project_receipts` ADD `basis` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `project_receipts` ADD `approved_by` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `project_receipts` ADD `approved_at` integer;
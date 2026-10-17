ALTER TABLE `distribution_shares` ADD `paid_on` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `distribution_shares` ADD `paid_ref` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `distributions` ADD `paid_on` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `distributions` ADD `paid_by` text DEFAULT '' NOT NULL;
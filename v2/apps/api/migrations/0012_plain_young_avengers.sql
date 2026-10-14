ALTER TABLE `projects` ADD `product_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `package_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `package_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_projects_product` ON `projects` (`org_id`,`product_id`);
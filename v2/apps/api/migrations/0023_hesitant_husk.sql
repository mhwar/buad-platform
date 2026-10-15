ALTER TABLE `product_requests` ADD `package_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `product_requests` ADD `stage_changed_at` integer DEFAULT 0 NOT NULL;
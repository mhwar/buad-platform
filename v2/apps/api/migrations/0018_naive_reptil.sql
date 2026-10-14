ALTER TABLE `product_requests` ADD `owner_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `product_requests` ADD `follow_up_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `product_requests` ADD `value_halalas` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_requests` ADD `lost_reason` text DEFAULT '' NOT NULL;
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`tagline` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`show_on_site` integer DEFAULT false NOT NULL,
	`content` text DEFAULT '{}' NOT NULL,
	`pricing` text DEFAULT '{}' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_products_slug` ON `products` (`org_id`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_products_org` ON `products` (`org_id`,`status`);
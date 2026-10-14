CREATE TABLE `product_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`product_id` text DEFAULT '' NOT NULL,
	`product_name` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'site' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`name` text NOT NULL,
	`entity` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`answers` text DEFAULT '{}' NOT NULL,
	`quote` text DEFAULT '{}' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`client_id` text DEFAULT '' NOT NULL,
	`project_id` text DEFAULT '' NOT NULL,
	`ip_hash` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_requests_org` ON `product_requests` (`org_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_requests_ip` ON `product_requests` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE TABLE `site_settings` (
	`org_id` text PRIMARY KEY NOT NULL,
	`draft` text DEFAULT '{}' NOT NULL,
	`published` text DEFAULT '' NOT NULL,
	`published_at` integer DEFAULT 0 NOT NULL,
	`published_by` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);

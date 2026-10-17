CREATE TABLE `org_settings` (
	`org_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`org_id`, `key`),
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);

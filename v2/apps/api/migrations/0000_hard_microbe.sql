CREATE TABLE `legacy_map` (
	`kind` text NOT NULL,
	`legacy_id` text NOT NULL,
	`new_id` text NOT NULL,
	`imported_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`kind`, `legacy_id`)
);
--> statement-breakpoint
CREATE TABLE `orgs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`password_hash` text DEFAULT '' NOT NULL,
	`legacy_hash` text DEFAULT '' NOT NULL,
	`must_change_pass` integer DEFAULT false NOT NULL,
	`token_version` integer DEFAULT 0 NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_users_org` ON `users` (`org_id`);
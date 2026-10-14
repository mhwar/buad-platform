CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`at` integer DEFAULT (unixepoch()) NOT NULL,
	`user_id` text DEFAULT '' NOT NULL,
	`user_name` text DEFAULT '' NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text DEFAULT '' NOT NULL,
	`action` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`detail` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audit_org_at` ON `audit_log` (`org_id`,`at`);--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_log` (`org_id`,`entity`,`entity_id`);--> statement-breakpoint
CREATE TABLE `org_roles` (
	`org_id` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`perms` text DEFAULT '[]' NOT NULL,
	`scopes` text DEFAULT '{}' NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`org_id`, `key`),
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `project_members` (
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`added_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`project_id`, `user_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_pm_user` ON `project_members` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `role_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `active` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `last_login_at` integer DEFAULT 0 NOT NULL;
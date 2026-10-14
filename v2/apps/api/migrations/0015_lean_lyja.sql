CREATE TABLE `plan_cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`start_date` text DEFAULT '' NOT NULL,
	`end_date` text DEFAULT '' NOT NULL,
	`vision` text DEFAULT '' NOT NULL,
	`mission` text DEFAULT '' NOT NULL,
	`values` text DEFAULT '[]' NOT NULL,
	`parent_cycle_id` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_plan_cycles_org` ON `plan_cycles` (`org_id`,`kind`);--> statement-breakpoint
CREATE TABLE `plan_indicators` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`objective_id` text NOT NULL,
	`name` text NOT NULL,
	`unit` text DEFAULT '' NOT NULL,
	`baseline` real DEFAULT 0 NOT NULL,
	`target` real DEFAULT 0 NOT NULL,
	`current` real DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`direction` text DEFAULT 'up' NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`objective_id`) REFERENCES `plan_objectives`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_plan_ind_obj` ON `plan_indicators` (`objective_id`);--> statement-breakpoint
CREATE TABLE `plan_initiatives` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`objective_id` text NOT NULL,
	`title` text NOT NULL,
	`owner_id` text DEFAULT '' NOT NULL,
	`start_date` text DEFAULT '' NOT NULL,
	`due_date` text DEFAULT '' NOT NULL,
	`budget_halalas` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`project_id` text DEFAULT '' NOT NULL,
	`product_id` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`objective_id`) REFERENCES `plan_objectives`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_plan_init_obj` ON `plan_initiatives` (`objective_id`);--> statement-breakpoint
CREATE TABLE `plan_objectives` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`cycle_id` text NOT NULL,
	`parent_id` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`owner_id` text DEFAULT '' NOT NULL,
	`quarter` integer DEFAULT 0 NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	`budget_halalas` integer DEFAULT 0 NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cycle_id`) REFERENCES `plan_cycles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_plan_obj_cycle` ON `plan_objectives` (`cycle_id`);--> statement-breakpoint
CREATE TABLE `plan_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`objective_id` text NOT NULL,
	`quarter` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`snapshot` text DEFAULT '{}' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`objective_id`) REFERENCES `plan_objectives`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_plan_rev_obj` ON `plan_reviews` (`objective_id`);
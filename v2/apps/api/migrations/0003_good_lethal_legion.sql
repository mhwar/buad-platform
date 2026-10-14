CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`sha256` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`r2_key` text NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_assets_hash` ON `assets` (`org_id`,`sha256`);--> statement-breakpoint
CREATE TABLE `doc_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'contract' NOT NULL,
	`body` text DEFAULT '{}' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_templates_org` ON `doc_templates` (`org_id`);--> statement-breakpoint
CREATE TABLE `document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`approved_by` text NOT NULL,
	`approved_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_versions_document` ON `document_versions` (`document_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`number` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`template_key` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`variables` text DEFAULT '{}' NOT NULL,
	`content` text DEFAULT '[]' NOT NULL,
	`layout` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`approved_by` text DEFAULT '' NOT NULL,
	`approved_at` integer,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_documents_number` ON `documents` (`org_id`,`number`);--> statement-breakpoint
CREATE INDEX `idx_documents_project` ON `documents` (`project_id`,`kind`);--> statement-breakpoint
CREATE TABLE `org_profile` (
	`org_id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`reg` text DEFAULT '' NOT NULL,
	`tax` text DEFAULT '' NOT NULL,
	`signer_name` text DEFAULT '' NOT NULL,
	`signer_title` text DEFAULT '' NOT NULL,
	`signer_id` text DEFAULT '' NOT NULL,
	`bank_name` text DEFAULT '' NOT NULL,
	`bank_iban` text DEFAULT '' NOT NULL,
	`logo_asset` text DEFAULT '' NOT NULL,
	`stamp_asset` text DEFAULT '' NOT NULL,
	`signature_asset` text DEFAULT '' NOT NULL,
	`header_asset` text DEFAULT '' NOT NULL,
	`footer_asset` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action
);

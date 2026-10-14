CREATE TABLE `document_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`document_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`channel` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`views` integer DEFAULT 0 NOT NULL,
	`last_viewed_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_document_shares_token` ON `document_shares` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_document_shares_document` ON `document_shares` (`document_id`);
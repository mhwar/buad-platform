ALTER TABLE `projects` ADD `closed_at` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `closed_by` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `close_note` text DEFAULT '' NOT NULL;
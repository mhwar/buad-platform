ALTER TABLE `documents` ADD `outgoing_no` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `outgoing_at` integer;--> statement-breakpoint
ALTER TABLE `documents` ADD `outgoing_by` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_documents_outgoing` ON `documents` (`org_id`,`outgoing_no`) WHERE outgoing_no <> '';
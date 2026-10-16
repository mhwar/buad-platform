CREATE INDEX `idx_documents_org_status` ON `documents` (`org_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_receipts_org_date` ON `project_receipts` (`org_id`,`date`);
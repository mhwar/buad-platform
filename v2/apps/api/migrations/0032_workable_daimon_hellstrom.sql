ALTER TABLE `users` ADD `recovery_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `recovery_at` integer;
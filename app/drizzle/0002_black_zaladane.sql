CREATE TABLE IF NOT EXISTS `account_storage_leases` (
	`owner` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL
);

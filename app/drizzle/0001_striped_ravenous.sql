CREATE TABLE `account_records` (
	`owner` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `legacy_claims` (
	`device` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL
);

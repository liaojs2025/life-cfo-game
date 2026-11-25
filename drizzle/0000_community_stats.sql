CREATE TABLE `finishes` (
	`run` text PRIMARY KEY NOT NULL,
	`country` text NOT NULL,
	`edition` text NOT NULL,
	`outcome` text NOT NULL,
	`year` integer NOT NULL,
	`wealth` real NOT NULL,
	`investment_return` real NOT NULL,
	`recorded_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `finish_time` ON `finishes` (`recorded_at`);--> statement-breakpoint
CREATE INDEX `finish_outcome` ON `finishes` (`outcome`);--> statement-breakpoint
CREATE TABLE `visits` (
	`id` text PRIMARY KEY NOT NULL
);

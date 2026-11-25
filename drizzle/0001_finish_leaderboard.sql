ALTER TABLE `finishes` ADD `finished_at` integer;--> statement-breakpoint
CREATE INDEX `finish_rank` ON `finishes` (`outcome`,investment_return DESC,`recorded_at`,`run`);
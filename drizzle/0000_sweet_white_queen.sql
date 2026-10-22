CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_id` text NOT NULL,
	`before` text,
	`after` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`auth_id` text,
	`role` text NOT NULL,
	`state` text NOT NULL,
	`invite_expires` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_email_unique` ON `members` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `members_auth_id_unique` ON `members` (`auth_id`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`natural_key` text NOT NULL,
	`owner_id` text,
	`project_id` text,
	`task_id` text,
	`date` text,
	`status` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `record_natural_key` ON `records` (`kind`,`natural_key`);--> statement-breakpoint
CREATE INDEX `record_scope` ON `records` (`kind`,`owner_id`);--> statement-breakpoint
CREATE INDEX `record_task` ON `records` (`task_id`);
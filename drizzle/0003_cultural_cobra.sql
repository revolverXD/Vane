CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `chats` ADD `projectId` text;
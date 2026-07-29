CREATE TABLE `app_release_notes_state` (
  `id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
  `last_acknowledged_version` text NOT NULL,
  `updated_at` integer NOT NULL
);

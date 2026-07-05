# Update wlcb1 new-api Docker

## Goal

Safely update the `wlcb1` Docker deployment of `new-api` after confirming disk space is sufficient and backups are complete.

## Requirements

- Check available disk space before any backup or update operation.
- Record current container/image/runtime metadata for rollback.
- Back up the `new-api` data directory at `/opt/1panel/apps/new-api/data`.
- Back up the active MySQL database referenced by the container `SQL_DSN` without exposing credentials in logs.
- Update the Docker deployment from current `v1.0.0-rc.15` to current `calciumion/new-api:latest` / `v1.0.0-rc.16` if backups succeed.
- Verify updated app version, container health/logs, and HTTP `/api/status` after update.
- Preserve rollback path to the previous image digest.

## Acceptance Criteria

- [x] Disk space check shows enough free space for backups and image pull, or update is aborted.
- [x] Rollback metadata is saved.
- [x] Data directory backup is created successfully.
- [x] Active MySQL database backup is created successfully.
- [x] Container is updated and running on target version.
- [x] Post-update logs and HTTP status checks pass.
- [x] Final report lists backup paths, old/new versions, and rollback command outline.

## Guardrails

- Do not print database passwords, tokens, cookies, or full environment values.
- Do not delete old images or backups during this task.
- Stop before update if disk space, database identification, or backup fails.

## Result

Completed successfully. See `report.md`.

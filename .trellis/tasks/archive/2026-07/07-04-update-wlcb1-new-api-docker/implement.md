# Implementation Plan

1. Record current container metadata, image labels, mounts, ports, network, restart policy, and env names only.
2. Estimate backup and update space requirements; check filesystem capacity for data, Docker root, and backup target.
3. Create a timestamped backup directory under `/root/backups/new-api-update-<timestamp>`.
4. Archive `/opt/1panel/apps/new-api/data` into the backup directory.
5. Parse `SQL_DSN` inside the remote shell without printing secrets; run MySQL dump from inside a temporary/mysql-capable context or existing MySQL container.
6. Pull `calciumion/new-api:latest` and confirm it resolves to `v1.0.0-rc.16`.
7. Recreate or restart `new-api` with identical env/mount/network/ports/restart policy using the updated image.
8. Verify binary version, image labels, logs, container status, and HTTP `/api/status`.
9. Write final update report and rollback outline.

## Abort Conditions

- Free disk space is not comfortably above estimated backup + new image need.
- MySQL dump cannot be created and verified non-empty.
- Data directory backup cannot be created and verified.
- Current container metadata cannot be captured.

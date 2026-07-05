# wlcb1 new-api Docker update report

## Summary

Updated `wlcb1` `new-api` Docker deployment from `v1.0.0-rc.15` to `v1.0.0-rc.16` after confirming disk space and creating verified backups.

## Disk space

- Before backup/update: `/dev/vda3` 40G total, 34G used, 3.4G available, 92% used.
- After update: `/dev/vda3` 40G total, 35G used, 3.2G available, 92% used.
- Docker root: `/var/lib/docker` on the same filesystem.
- Docker image footprint before: 17.07GB; after: 17.28GB.
- Estimated backup inputs: app data about 20M; MySQL database about 68.52MB.
- Decision: enough space for compressed backups and one new image pull; no cleanup performed.

## Backups

Backup directory on `wlcb1`:

```text
/root/backups/new-api-update-20260705-085034
```

Created files:

- `rollback-metadata.txt` — redacted current container/image/runtime metadata.
- `container.env` — protected env file for recreate/rollback; contains secrets and is chmod 600.
- `new-api-data.tgz` — archive of `/opt/1panel/apps/new-api/data`.
- `new-api-data.tgz.sha256` — checksum for data archive.
- `new_api.sql.gz` — MySQL dump for database `new_api`.
- `mysql.sql.gz.sha256` — checksum for MySQL dump.
- `mysql-backup-info.txt` — database host/user/container metadata without password.
- `update.log` — image pull and recreate log.
- `verify.log` — post-update verification output.

Backup verification:

- `sha256sum -c new-api-data.tgz.sha256`: OK.
- `sha256sum -c mysql.sql.gz.sha256`: OK.
- `gzip -t new_api.sql.gz`: OK.
- `tar -tzf new-api-data.tgz`: OK.

## Update details

Previous deployment:

- Container: `new-api`
- Image ref: `calciumion/new-api:latest`
- Version: `v1.0.0-rc.15`
- Revision: `69b0f0b56f528efa292a2893feb0c55c37399f4b`
- Image ID/digest: `sha256:b48008e35e4213836287b375c20df6278a49a36499c46311f3ef15210d0d4095`

New deployment:

- Container: `new-api`
- Image ref: `calciumion/new-api:latest`
- Version: `v1.0.0-rc.16`
- Revision: `0977965d933f599b0bbed3ca501b67abce6ce712`
- Image ID/digest: `sha256:4bde2fedaf1048807e9ca2365ab0b188a5c9ada02b92b265b18181eb8c1b247f`
- Port mapping: `0.0.0.0:3810->3000/tcp`, `[::]:3810->3000/tcp`
- Network: `app-net`, IP `172.20.0.10`
- Mount: `/opt/1panel/apps/new-api/data:/data`
- Restart policy: `unless-stopped`

The previous container was preserved as:

```text
new-api-preupdate-20260705-085229
```

## Verification

- `docker ps` shows `new-api` running on `calciumion/new-api:latest`.
- `docker exec new-api /new-api --version` returned `v1.0.0-rc.16`.
- Logs show MySQL mode, database migration start, and successful startup: `New API v1.0.0-rc.16 started`.
- `curl http://127.0.0.1:3810/api/status` returned JSON data successfully.
- `curl http://127.0.0.1:3810/api/about` returned `{"data":"","message":"","success":true}`.

Observed logs include normal live traffic and some upstream/client cancellation errors unrelated to container startup; no startup or migration failure was observed.

## Rollback outline

If rollback is needed, keep backups and old container/image intact. A safe manual rollback shape is:

```bash
ssh wlcb1
BACKUP_DIR=/root/backups/new-api-update-20260705-085034
OLD_CONTAINER=$(cat "$BACKUP_DIR/old-container-name.txt")
docker stop new-api
docker rename new-api new-api-rollback-failed-$(date +%Y%m%d-%H%M%S)
docker rename "$OLD_CONTAINER" new-api
docker start new-api
curl -fsS --max-time 8 http://127.0.0.1:3810/api/status
```

If data rollback is required, restore MySQL from `new_api.sql.gz` and app data from `new-api-data.tgz` after stopping the app; do not do that unless current data must be discarded.

# wlcb1 new-api update dry-run report

## Scope

Read-only review of `wlcb1` deployment against `https://github.com/QuantumNous/new-api`. No update, restart, image pull, migration, or destructive action was performed.

## Current deployment

- Host: `wlcb1` / `iZ0jl3ydapj0gm8juma6n2Z`
- Deployment type: Docker container managed outside a source checkout; app data under `/opt/1panel/apps/new-api/data`
- Container: `new-api`
- Published port: host `3810` -> container `3000`
- Image reference: `calciumion/new-api:latest`
- Local image digest: `sha256:b48008e35e4213836287b375c20df6278a49a36499c46311f3ef15210d0d4095`
- App version reported by binary/image labels: `v1.0.0-rc.15`
- Source revision in image labels: `69b0f0b56f528efa292a2893feb0c55c37399f4b`
- Image created: `2026-06-24T12:59:07Z`
- Restart policy: `unless-stopped`
- Data bind mount: `/opt/1panel/apps/new-api/data` -> `/data`
- Environment names only: `SQL_DSN`, `PATH`; `SQL_DSN` appears to be MySQL/TCP with credentials redacted
- Data size: `/opt/1panel/apps/new-api/data` about `19M`
- Local sqlite-looking file exists but does not appear to be active because `SQL_DSN` points to MySQL: `one-api.db`, `one-api.db.bak.20260629`

## Upstream target state

- GitHub default branch: `main`
- Upstream HEAD: `1ae757475f9e8dad4ffedf89b3e707756fe8ecf9` (`2026-07-04`, `fix: align dynamic pricing style with log details dialog sections`)
- Latest tag found: `v1.0.0-rc.16`
- `v1.0.0-rc.16` revision: `0977965d933f599b0bbed3ca501b67abce6ce712`
- Docker Hub `calciumion/new-api:latest` currently points to the same digest as `v1.0.0-rc.16`: `sha256:4bde2fedaf1048807e9ca2365ab0b188a5c9ada02b92b265b18181eb8c1b247f`
- `latest` last updated: `2026-07-03T07:44:40Z`

## Delta

- Current deployed version: `v1.0.0-rc.15`
- Available Docker `latest`: `v1.0.0-rc.16`
- `rc.15 -> rc.16`: 42 commits, 873 files changed, about 23,037 insertions and 8,133 deletions
- `rc.15 -> main`: 60 commits, 889 files changed, about 25,038 insertions and 10,014 deletions
- `rc.16 -> main`: 18 commits not yet in tagged release/latest image

## Notable changed areas from rc.15 to current main

- Backend authorization: new authz service, channel authz routes/controllers/models, Casbin model tables/files
- Relay compatibility: OpenAI Responses / Chat conversion, Gemini Responses support, Ollama non-stream tool-call fix
- Channel/task logic: advanced custom routes, channel settings, task billing, Doubao/Wan media and billing changes
- Web UI: large default frontend changes, classic frontend build and deprecation banner, dynamic pricing/channel test UI refinements
- Security/bug fixes: auth guard behavior, rich content rendering hardening, access_token omission in user queries, dependency bumps
- Operational build/release: Docker workflow changes and make target renames

## Risk assessment

- Update size is moderate-to-large for a point rc bump because it includes backend authz/data-model changes and large frontend changes.
- Deployment is image-based, so source git dirty state is not relevant; risk is mainly container image replacement plus application/database compatibility.
- Because `SQL_DSN` targets MySQL, a safe update should include MySQL backup, not only copying `/opt/1panel/apps/new-api/data`.
- The app currently uses mutable `latest`; pulling/recreating will jump from `rc.15` to `rc.16` today. Pinning `v1.0.0-rc.16` is safer/reproducible.
- Current `/opt/1panel/apps/new-api` directory does not include compose files; update likely needs to be performed through 1Panel app management or by identifying the original compose record outside that directory.

## Safe next dry-run commands

These are read-only or non-mutating planning checks unless explicitly noted:

```bash
ssh wlcb1 'docker inspect new-api --format "{{.Config.Image}} {{.Image}}"'
ssh wlcb1 'docker logs --tail=200 new-api'
ssh wlcb1 'docker ps --filter name=mysql --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"'
ssh wlcb1 'find /opt/1panel -maxdepth 6 -type f \( -name "docker-compose.yml" -o -name "data.yml" \) | grep -i new-api'
```

## Mutating update outline requiring explicit confirmation

1. Export/backup MySQL database used by `SQL_DSN`.
2. Snapshot `/opt/1panel/apps/new-api/data`.
3. Pull a pinned image: `calciumion/new-api:v1.0.0-rc.16` (or use 1Panel update UI).
4. Recreate only the `new-api` container with the same env, network, port, mount, and restart policy.
5. Verify `/new-api --version`, `/api/status`, logs, login, channel list, and a low-cost model test.
6. Roll back to local digest/tag `v1.0.0-rc.15` if startup/login/channel checks fail.

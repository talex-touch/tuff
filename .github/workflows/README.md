# GitHub Actions Workflows

This directory contains GitHub Actions workflows for CI/CD automation.

## Workflows Overview

### Main Application Workflows

- **`ci.yml`** - Main CI workflow for pull requests
  - Checks for disallowed file changes (lock files)
  - Lints markdown files
  - Runs typecheck on the entire monorepo

- **`build-and-release.yml`** - Build and release workflow for Electron app
  - Builds the application for multiple platforms
  - Creates releases and uploads artifacts
  - Generates `tuff-release-manifest.json` for updater validation
  - Syncs Release metadata/assets to Nexus APIs (tag push only)
  - Notes sync priority (tag push): `notes/update_<version>.zh.md` + `notes/update_<version>.en.md` → `notes/update_<version>.md` → GitHub release body fallback
  - 若配置 `NEXUS_SYNC_BASE_URL` 或 `ADMIN_CF_ACCESS_CLIENT_ID` / `ADMIN_CF_ACCESS_CLIENT_SECRET`，则仍会正常执行完整 Nexus 同步链路
  - `sync-nexus-release` 仅在 `POST /api/releases` 返回精确的重复 tag 错误时才转 `PATCH`；其余非 2xx 会按真实错误失败
  - Nexus `create / patch / get / link-github / publish` 成功响应会额外校验最小 JSON 结构，避免 HTML 错页或错误代理页被误判为成功

- **`pr-flags.yml`** - PR flag management
  - Adds/removes labels based on PR content

- **`release-drafter.yml`** - Release draft automation
  - Updates the release draft on `main` pushes / merged PRs

- **`readme-contributors.yml`** - Contributors list automation
  - Updates README contributors list on `master` pushes

- **`pilot-ci.yml`** - Pilot 前端 CI + 静态产物
  - 触发条件：`apps/pilot/**` 相关变更
  - `quality`：lint / typecheck（非阻塞）+ test / build（阻塞）
  - `static-dist`：`nuxt generate` + `prepare:cf-static` 并上传 `pilot-dist` artifact

- **`pilot-image.yml`** - Pilot Docker 镜像发布到 GHCR
  - 触发条件：`master` push 且命中 `apps/pilot/**`、`packages/**` 或锁文件/工作流改动
  - 使用 `apps/pilot/Dockerfile` 构建 `ghcr.io/<owner>/tuff-pilot`
  - 推送标签：`pilot-<short_sha>` + `pilot-latest`
  - 输出镜像 digest，供后续 1Panel 回滚与审计
  - 若配置 `ONEPANEL_WEBHOOK_URL` + `ONEPANEL_WEBHOOK_TOKEN`，镜像发布后自动 `POST /deploy`
  - 1Panel webhook 会做有限重试；连通性异常只记 warning，不阻塞已经成功的 GHCR 镜像发布
  - webhook 鉴权使用 `X-Pilot-Token: $ONEPANEL_WEBHOOK_TOKEN`（服务端变量为 `PILOT_WEBHOOK_TOKEN`）

### Package CI Workflows

#### Reusable Workflow

**`package-ci.yml`** - Reusable workflow for package CI/CD

This is a reusable workflow that can be called by other workflows to standardize package CI/CD processes.

**Inputs:**
- `package-name` (required) - Package name for identification
- `package-path` (required) - Path to package relative to repo root
- `node-version` (optional, default: `22.16.0`) - Node.js version
- `pnpm-version` (optional, default: `9`) - PNPM version
- `run-lint` (optional, default: `false`) - Enable linting
- `run-test` (optional, default: `false`) - Enable tests
- `run-build` (optional, default: `false`) - Enable build
- `run-typecheck` (optional, default: `false`) - Enable typecheck
- `build-command` (optional, default: `pnpm build`) - Custom build command
- `test-command` (optional, default: `pnpm test`) - Custom test command
- `lint-command` (optional, default: `pnpm lint`) - Custom lint command
- `typecheck-command` (optional, default: `pnpm typecheck`) - Custom typecheck command

**Features:**
- Automatic dependency caching
- Conditional job execution based on inputs
- Build artifact upload with 7-day retention
- Consistent Node.js and PNPM setup across packages

#### Package-Specific Workflows

- **`package-utils-ci.yml`** - CI for `@talex-touch/utils`
  - Triggers on changes to `packages/utils/**`
  - TypeScript source package (no build step)

- **`package-utils-publish.yml`** - Publish for `@talex-touch/utils`
  - Triggers on version changes in `packages/utils/package.json` (push to `main` / `master`)
  - Runs `packages/utils` tests before publish
  - Publishes to npm with `latest` for stable versions and `next` for prereleases
  - Requires repository secret `NPM_TOKEN` with publish permission for `@talex-touch/utils`

- **`package-tuffex-ci.yml`** - CI for `@talex-touch/tuffex`
  - Triggers on changes to `packages/tuffex/**`
  - Runs build process

- **`package-tuffex-publish.yml`** - Publish for `@talex-touch/tuffex`
  - Triggers on version changes in `packages/tuffex/package.json` (push to main)
  - Builds and publishes to npm

- **`package-tuff-cli-publish.yml`** - Publish for CLI packages
  - Publishes `@talex-touch/tuff-cli-core` → `@talex-touch/tuffcli` → `@talex-touch/unplugin-export-plugin` → `@talex-touch/tuff-cli`
  - Uses `latest` for stable versions and `next` for prereleases
  - Syncs publish summary to Nexus dashboard updates API

- **`package-unplugin-ci.yml`** - CI for `@talex-touch/unplugin-export-plugin`
  - Triggers on changes to `packages/unplugin-export-plugin/**`
  - Runs lint and build

## Adding CI for a New Package

To add CI for a new package, create a new workflow file:

```yaml
name: Your Package CI

on:
  pull_request:
    branches:
      - main
    paths:
      - 'packages/your-package/**'
      - '.github/workflows/package-your-package-ci.yml'
      - '.github/workflows/package-ci.yml'
  push:
    branches:
      - main
    paths:
      - 'packages/your-package/**'

jobs:
  ci:
    uses: ./.github/workflows/package-ci.yml
    with:
      package-name: your-package
      package-path: packages/your-package
      run-typecheck: true
      run-lint: true
      run-test: true
      run-build: true
      # Customize commands if needed
      build-command: pnpm build
      test-command: pnpm test
```

## Best Practices

1. **Path Filters**: Always include the workflow file itself in the path filter to trigger on workflow changes
2. **Reusable Workflow**: Include `package-ci.yml` in path filters so changes to the reusable workflow trigger all package CIs
3. **Conditional Steps**: Only enable steps (lint, test, build) that your package actually supports
4. **Custom Commands**: Override default commands if your package uses different script names
5. **Node Version**: Keep Node.js version consistent with the main app (currently 22.16.0)

## Workflow Execution Order

For package workflows:
1. Checkout code
2. Setup PNPM and Node.js
3. Install dependencies (with caching)
4. Run typecheck (if enabled)
5. Run lint (if enabled)
6. Run tests (if enabled)
7. Run build (if enabled)
8. Upload build artifacts (if build enabled)

## Debugging Workflows

- Check the Actions tab in GitHub for workflow runs
- Review logs for each step
- Ensure package scripts exist in `package.json`
- Verify path filters match your file changes
- Test locally with the same commands before pushing

## Maintenance

When updating:
- Keep Node.js version in sync with Volta configuration
- Update PNPM version when upgrading in the project
- Review and update path filters when restructuring packages
- Test workflow changes in a feature branch first

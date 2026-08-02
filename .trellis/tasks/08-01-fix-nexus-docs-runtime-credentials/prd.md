# 修复 Nexus 文档运行时凭据失配

## Goal

恢复 `pnpm run nexus:dev` / `pnpm -C apps/nexus dev` 的本地 Cloudflare 开发模式，使 Nuxt Content 文档查询不再因缺失平台凭据返回 `NEXUS_RUNTIME_CREDENTIAL_INVALID`，同时保持远程 Preview 凭据校验 fail-closed。

## Background

- 默认 Nexus `dev` 脚本启用 `nitro-cloudflare-dev`，并加载 `wrangler.toml` 的 Preview D1/R2 bindings。
- Preview 安全加固已从可部署配置中移除凭据值，这是必须保留的安全边界。
- `nitro-cloudflare-dev` 创建 Cloudflare binding 对象后，运行时凭据选择会将该对象视为权威来源；本地进程中的 `.env` / `.env.local` 凭据不会自动成为 binding。
- 全局运行时凭据中间件因此在 Nuxt Content 内部查询时拒绝缺失的 `AUTH_SECRET`，健康检查又把异常泛化成 `better-sqlite3` 提示。

## Requirements

- 仅在 `NODE_ENV` 非生产且显式启用 `NUXT_USE_CLOUDFLARE_DEV=true` 时，将该运行时识别为本地 Cloudflare 开发边界。
- 本地边界只能从进程环境补入明确白名单内的 Nexus credential bindings，不能复制任意环境变量。
- 已存在的 Cloudflare binding 值优先于本地进程值。
- 远程 Preview、生产环境和未显式标记的 Cloudflare bindings 继续拒绝缺失、占位或 local-only 凭据。
- 不向 `wrangler.toml`、受版本控制的 `.env` 或日志写入真实 Secret。
- 增加回归测试，覆盖本地补入、平台优先级及非本地不回退。

## Acceptance Criteria

- [x] 默认 Nexus dev 模式首次 Nuxt Content 查询不再返回 `NEXUS_RUNTIME_CREDENTIAL_INVALID`。
- [x] 本地 Cloudflare dev 可读取 Preview D1/R2 bindings，并从白名单本地配置解析认证凭据。
- [x] 显式平台凭据覆盖同名进程环境值。
- [x] 生产环境或未显式本地标记的 binding 对象不会读取进程环境凭据。
- [x] 相关单元测试、Nexus typecheck、scoped lint 与 `git diff --check` 通过。

## Out of Scope

- 修改或上传 Cloudflare Pages Secret 值。
- 放宽远程 Preview / Production 的凭据强度和来源校验。
- 重构 Nexus 认证系统或 Nuxt Content 存储实现。

# 修复 Preview Secret 配置 #475

## Goal

移除可部署 Preview 配置中的可预测凭据占位值，为 Cloudflare Preview 增加不泄露值的 Secret 库存校验与非本地运行时 fail-closed 校验，并保留明确隔离的本地开发默认值。

## Requirements

- `wrangler.toml` 的 `[env.preview.vars]` 只保留非敏感配置，所有凭据变量改由 Cloudflare Pages Secret 提供。
- 固定维护 Preview 必需 Secret 名称清单，不记录、读取或输出 Secret 值。
- 部署命令在 build/deploy 前校验 Cloudflare Preview Secret 库存；缺失时返回稳定错误码并拒绝部署。
- 本地预览可继续使用 local-only 默认值，但这些默认值不得进入远程部署配置或被非本地 runtime 接受。
- Runtime 对非开发环境的缺失、过短、文档占位值和已知本地默认值 fail closed。
- 文档说明 Secret 名称、Cloudflare 配置命令和无值验证方法。

## Acceptance Criteria

- [ ] `wrangler.toml` 不包含 Preview credential 值或默认占位值。
- [ ] 确定性测试覆盖缺失库存、完整库存、占位值拒绝、无 Secret 值日志。
- [ ] 远程 Preview 部署入口在缺失必需 Secret 时失败。
- [ ] 本地 Pages 模拟保留明确 local-only 默认值。
- [ ] Preview auth、app JWT 与 emergency-control 运行时只接受平台 Secret。
- [ ] Nexus focused tests、typecheck、scoped lint、配置扫描与 `git diff --check` 通过。

## Out of Scope

- 生成、提交或回显真实 Secret 值。
- 未经单独确认写入 Cloudflare Secret、部署 Preview 或修改生产环境。
- 重构 Nexus 完整认证系统。

# 双语 What's Changed 实施计划

## Scope

本任务是跨发布脚本、GitHub Actions、Nexus API、shared transport、CoreApp main/SQLite 与 renderer UI 的复杂改动。实施遵循 TDD；每一阶段先加入失败用例，再写最小实现。author 唯一新增版本化输入始终是两份 Markdown，不引入第二份手工正文或必交 evidence。

## 1. RED — 固定 Markdown 契约

- [ ] 为 release-notes parser 添加失败测试：缺 zh/en、错误 H1/version、Summary Notes 少于 3 或多于 6、What's Changed 缺失/为空、双语可选章节集合不同、条目数不同、占位文案、共享 `.md` 回退。
- [ ] 添加成功测试：纯修复版没有 What's New；带 Breaking Changes/Known Limitations；Beta/stable 版本；中文/英文自然文案。
- [ ] 为强契约基线与 Snapshot/Legacy 豁免添加边界测试。
- [ ] 先确认测试因缺实现或旧宽松行为失败。

验证：

```bash
pnpm exec vitest run scripts/generate-release-notes.test.mjs scripts/check-release-gates/local-checks.test.mjs
```

## 2. GREEN — 实现本地 prepare/verify 与单一 parser

- [ ] 提取一个基于 `marked` token/AST 的 parser/normalizer；`generate-release-notes`、local gate 和 catalog generator 共用它。
- [ ] 实现可选 `prepare`：解析目标版本、channel、target ref、previous same-channel tag、commit/merged PR 范围，输出 stdout/临时模板，不写必交 evidence。
- [ ] 实现 `verify`：默认读取根/CoreApp version 和目标双语文件；支持 tag workflow 显式传 version/channel。
- [ ] 增加 root scripts，保证本地 author 可一条命令检查。
- [ ] 更新 `notes/RELEASE_NOTES_GUIDE.md` 的 author 模板和“云端不生成正文”规则；若并行文档代理仍占有该范围，先协调再改。

验证：

```bash
pnpm exec vitest run scripts/generate-release-notes.test.mjs scripts/check-release-gates/local-checks.test.mjs
node scripts/check-release-gates.mjs --tag "v<version>" --version "<version>" --stage gate-d --strict
```

## 3. RED/GREEN — 发布链路只消费 author 文档

- [ ] 添加生成器回归：Release/Beta 缺 author 文件时失败，不再自动 PR/fallback；Snapshot 保持明确豁免。
- [ ] 添加 GitHub body 测试：Summary Notes 和完整双语内容来自 canonical docs，merged PR inventory 只作附录。
- [ ] 生成并测试 `tuff-release-notes.json` metadata asset，校验 schema/tag/version/channel/双语内容。
- [ ] 在 `quality:pr`、release gate 与 tag workflow 复用 `verify`；删除 Release/Beta Nexus/GitHub body fallback。
- [ ] 确认 release secrets 只出现在合并/tag 后的可信 workflow 路径。

验证：

```bash
pnpm exec vitest run scripts/generate-release-notes.test.mjs scripts/check-release-gates.test.mjs scripts/check-release-gates/local-checks.test.mjs
pnpm quality:pr
actionlint .github/workflows/build-and-release.yml .github/workflows/ci.yml
```

## 4. RED/GREEN — 生成 CoreApp 内置 catalog

- [ ] 为 catalog generator 添加测试：双语 summary 提取、Release/Beta 混排、baseline 过滤、当前完整 notes、重复/断档/目标不匹配失败。
- [ ] 实现 ignored/generated resource 输出；author 不提交 catalog。
- [ ] 将生成步骤接入 CoreApp dev/build 入口和 Electron resources 打包。
- [ ] 添加 packaged resource 校验，证明三平台配置均包含 catalog，且 catalog `generatedForVersion` 等于 App version。

验证：

```bash
pnpm exec vitest run scripts/generate-release-notes-catalog.test.mjs
pnpm -C apps/core-app run build
```

## 5. RED/GREEN — Shared localized contract 与 Update SDK

- [ ] 在 `packages/utils` 先写 normalizer/type-guard 测试：bundle、Nexus、GitHub metadata asset 的 valid/invalid payload。
- [ ] 定义 localized notes、summary、history page、bundled state 与 acknowledge 请求类型。
- [ ] 添加 typed Update events/SDK methods；更新 transport SDK tests，禁止 raw channel 或 UI 本地 cast。
- [ ] 保留旧 `GitHubRelease.body` 兼容现有更新提示，但新日志 UI 不使用它。

验证：

```bash
pnpm -C packages/utils exec vitest run __tests__/transport-domain-sdks.test.ts "<release-notes tests>"
pnpm -C packages/utils run typecheck
```

## 6. RED/GREEN — Nexus Release/Beta 历史分页

- [ ] 为 `/api/releases` 添加失败测试：非法 channel/cursor/limit、cursor 漂移、跨渠道数据泄漏、assets 默认误包含。
- [ ] 添加成功测试：稳定倒序、opaque cursor、hasMore/nextCursor、旧无 cursor 调用兼容、Legacy notes 返回。
- [ ] 扩展 `listReleases` 和 route response；保持 `/latest` 与 `/:tag` 契约不变。
- [ ] 更新 Nexus composable types，使现有 Dashboard 调用兼容新增 `pageInfo`。

验证：

```bash
pnpm -C apps/nexus exec vitest run "test/api/releases/**/*.test.ts" "server/utils/releasesStore.test.ts"
pnpm -C apps/nexus run check:api-routes
pnpm -C apps/nexus run typecheck
```

## 7. RED/GREEN — CoreApp main service、缓存与 SQLite 已读状态

- [ ] 使用实现时下一个可用 migration 编号添加 `app_release_notes_state`，先写 migration/repository 测试。
- [ ] 添加 startup decision tests：fresh onboarding、既有 profile 首次覆盖、同版本、单版本升级、跨多个 Release/Beta、跨渠道、异常未确认、降级/回滚。
- [ ] 实现 packaged catalog loader 与 runtime guard；损坏/缺失时返回 degraded，不阻塞启动。
- [ ] 实现 Nexus history/detail fetch 与独立 JSON catalog cache；测试分页、offline stale、cache corruption 和 GitHub source 设置不改变 Nexus history SoT。
- [ ] 注册 typed handlers；acknowledge 只在显式 UI 命令后写 SQLite。

验证：

```bash
pnpm -C apps/core-app exec vitest run "src/main/modules/update/**/*release-notes*.test.ts" "src/main/modules/update/update-repository.test.ts"
pnpm -C apps/core-app run typecheck:node
```

## 8. RED/GREEN — 首启 What's Changed

- [ ] 先写纯聚合 helper tests：semver 区间、Release/Beta 混合、目标展开、降级为空、baseline 截断。
- [ ] 写组件测试：本地化标题、单版本、多版本折叠、渠道标记、keyboard/focus、关闭/查看详情 acknowledge、导航失败不确认、语言切换。
- [ ] 新增独立 What's Changed 业务组件，使用 TuffEx Modal/Collapse/Button 与现有 sanitizer。
- [ ] 在 `useAppLifecycle` 的 main-window、storage-hydrated、renderer-ready 路径接入；onboarding 未完成时静默初始化，不展示。
- [ ] CTA 导航 `/setting?section=update&release=<tag>`。

验证：

```bash
pnpm -C apps/core-app exec vitest run "src/renderer/src/**/*release-notes*.test.ts" "src/renderer/src/**/*WhatsChanged*.test.ts"
pnpm -C apps/core-app run typecheck:web
```

## 9. RED/GREEN — Update 历史主从 UI

- [ ] 写历史 composable/component tests：默认渠道、tab 切换、分页、选中详情、current/latest/legacy、offline stale、empty/error、语言切换。
- [ ] 新建独立 Release Notes History 业务组件；桌面双栏，窄窗口 list/detail 单栏切换。
- [ ] `AppSettings.vue` 增加 update section anchor；`SettingUpdate.vue` 只负责编排，不内联全部历史逻辑。
- [ ] current bundled detail 优先；remote/cached history 通过 typed SDK。
- [ ] 添加 zh/en i18n 文案，并检查语义 controls、aria、focus 和稳定响应式尺寸。

验证：

```bash
pnpm -C apps/core-app exec vitest run "src/renderer/src/views/base/settings/**/*release-notes*.test.ts"
pnpm -C apps/core-app run typecheck:web
```

## 10. REFACTOR — 收敛重复与兼容路径

- [ ] 搜索所有 `release.body`、`notesHtml`、manual notes fallback 消费点；新功能只使用 shared localized contract。
- [ ] parser、summary projection、locale resolution、semver ordering 各自只有一个 owner。
- [ ] 不顺手删除旧 `GitHubRelease.body`；只有所有既有消费者明确迁移后才单独 clean cutover。
- [ ] 更新 `.trellis/spec/frontend/release-testing.md` 或 owning spec，记录“Release/Beta 必须提交双语 docs、云端不生成/fallback”的执行契约；先与并行文档代理协调所有权。

## 11. Full Validation

```bash
pnpm exec vitest run scripts/generate-release-notes.test.mjs scripts/check-release-gates.test.mjs scripts/check-release-gates/local-checks.test.mjs
pnpm -C packages/utils exec vitest run __tests__/transport-domain-sdks.test.ts
pnpm -C apps/nexus run typecheck
pnpm -C apps/nexus run check:api-routes
pnpm -C apps/core-app run typecheck:node
pnpm -C apps/core-app run typecheck:web
pnpm -C apps/core-app run build
git diff --check
```

对 UI 还需在桌面与窄窗口做 Playwright/packaged screenshot 验收，检查 modal、主从布局、滚动、文字溢出、focus 与语言切换。发布 workflow 变更必须用 actionlint 和一次不发布真实 release 的 dry-run/fixture 验证。

## Risk / Rollback Points

- **Release fallback removal**：先让严格 validator 在 CI 通过一个基线版本，再删除 fallback；失败时回滚 UI/生成投影，不能恢复静默发布缺日志版本。
- **Nexus pagination**：响应字段增量兼容，旧客户端继续读取 `releases`；必要时仅关闭 CoreApp history 调用。
- **Packaged catalog**：catalog 缺失只禁用 What's Changed，不得影响启动或 OTA；build gate 仍应阻止官方新版本产出缺 catalog 的包。
- **SQLite migration**：只加单例表；回滚代码可忽略该表，不执行 destructive down migration。
- **UI rollout**：首启弹窗与历史区可由本地 feature flag 暂停，但 Gateway 门禁保持启用。
- **并行边界**：实施前确认 docs/CHANGES/README/CI 文档门禁所有权；不覆盖其他工作树已交付内容。

# 双语 What's Changed 技术设计

## 1. 设计目标

以 `notes/update_<version>.zh.md` 与 `notes/update_<version>.en.md` 为每个 Release/Beta 版本唯一人工真源。release author 可使用任意本地工具撰写；仓库提供可选 `prepare` 帮助和强制 `verify` 校验。云端不生成、不翻译、不补写正文，只验证并把已提交内容确定性投影到 GitHub Release、Nexus、CoreApp 内置摘要和 UI。

## 2. 已确认的现状

- `notes/RELEASE_NOTES_GUIDE.md` 已声明双语 Markdown 路径，但当前格式只要求精简亮点。
- `scripts/check-release-gates/local-checks.mjs:15` 只检查 zh/en 非空，并允许共享 `.md` 回退；这不满足双语强契约。
- `scripts/generate-release-notes.mjs:473` 在手工文件缺失时自动生成 PR 列表正文；`.github/workflows/build-and-release.yml:1216` 还会回退到 GitHub Release body。
- Nexus 已持久化 `{ zh, en }` Markdown/HTML，并有 `GET /api/releases` 与 `GET /api/releases/:tag`；列表当前只有 `limit`，没有游标分页。
- `ReleaseFetchService.mapOfficialRelease()` 在 `apps/core-app/src/main/modules/update/services/release-fetch-service.ts:488` 把双语 notes 提前压成优先英文的 `GitHubRelease.body`。
- `packages/utils/types/update.ts:37` 的 `GitHubRelease` 只有单字符串 `body`；Update SDK 尚无日志历史或已读接口。
- `SettingUpdate.vue` 已是设置页更新区域；`AppSettings.vue` 将它挂在 `/setting`，可复用现有 `?section=` 深链模式。
- `UpdatePromptDialog.vue` 已使用安全 Markdown renderer，但它表示“发现可用更新”，不能兼任升级后首启 What's Changed。

## 3. 单一数据源与文档契约

### 3.1 Author 输入

每个强契约版本只新增两份 author 文件：

```text
notes/update_<version>.zh.md
notes/update_<version>.en.md
```

固定结构：

```markdown
# Tuff v<version> 更新说明 / Release Notes

## 摘要 / Summary Notes          # 必填，3-6 条

## 新增内容 / What's New         # 可选，有真实新能力时才出现

## 变更内容 / What's Changed     # 必填，至少 1 条详细变化

## 破坏性变更 / Breaking Changes # 可选

## 已知限制 / Known Limitations  # 可选
```

双语文件必须具有相同的可选章节集合和每节条目数量。`无 / None / N/A / TBD / TODO` 等占位内容不能满足非空要求。语义质量由本地 author 负责，确定性校验器不伪装成翻译或事实审查器。

### 3.2 解析与验证核心

新增一个无网络 Node 模块作为唯一解析/验证实现，供以下入口复用：

- 可选本地 `prepare`：解析前一同渠道 tag、commit 与 merged PR 范围，生成模板和 author 上下文，不产生必交 evidence。
- 强制本地 `verify`：校验目标版本、根/CoreApp 版本、双语文件、标题、章节、条目数量和占位内容。
- `quality:pr`：版本发生变化时执行 `verify`。
- `check-release-gates` 与 tag workflow：按 tag/version 再执行 `verify`。
- release notes generator：从已验证 AST/模型生成 GitHub/Nexus/App 投影，不再私自解析或 fallback。

优先复用仓库已有 `marked` lexer 生成 token/AST，不用正则拼接 Markdown 章节。解析结果使用一个内部 canonical model：

```ts
interface ReleaseNotesDocument {
  version: string
  locale: 'zh-CN' | 'en-US'
  summary: string[]
  whatsNew: string[]
  whatsChanged: string[]
  breakingChanges: string[]
  knownLimitations: string[]
  markdown: string
}
```

### 3.3 强契约基线

增加一次性 release-notes contract 配置，记录首个受强门禁约束的 semver。早于基线的 Nexus 记录标记为 `legacy`；不回填现有 146 个 tag。Snapshot 始终不进入该门禁和历史 UI。

## 4. 确定性投影

双语 Markdown 是唯一 author 输入；以下均为构建/发布时派生产物，不提交为第二真源：

1. GitHub Release body：使用两份文档中的 Summary Notes 与完整内容，保留自动 merged PR inventory 作为附录。
2. Nexus payload：`notes.zh/en` 原样写入 Markdown；`notesHtml` 仅供 Nexus Web 使用，CoreApp 不消费远端 HTML。
3. GitHub metadata asset：生成 `tuff-release-notes.json`，供 GitHub OTA fallback 保留与 Nexus 相同的双语 typed contract。
4. CoreApp catalog：构建前生成一个只读 JSON，包含强契约基线到当前版本的 Release/Beta 双语 summary，以及当前版本完整 Markdown。

建议 catalog schema：

```ts
interface BundledReleaseNotesCatalogV1 {
  schemaVersion: 1
  generatedForVersion: string
  enforcedFromVersion: string
  entries: Array<{
    version: string
    tag: string
    channel: 'RELEASE' | 'BETA'
    summary: { zh: string[]; en: string[] }
    currentNotes?: { zh: string; en: string }
  }>
}
```

构建失败条件包括：当前版本缺文档、catalog 目标版本与 package 不一致、summary 区间断档、同版本重复或 semver/channel 无法解析。catalog 生成在临时/ignored 资源目录，并随 Electron `resources/**` 打包；author 不提交它。

## 5. Nexus 历史 API

扩展现有 `GET /api/releases`，保持旧调用兼容，并新增：

```text
GET /api/releases?channel=RELEASE|BETA&status=published&limit=<n>&cursor=<opaque>
```

响应增加 `pageInfo: { nextCursor, hasMore }`。游标绑定稳定的发布顺序与 release id；服务端限制 page size，拒绝非法 channel/cursor/limit。默认不返回 assets，避免历史页携带平台资产矩阵。`GET /api/releases/:tag` 继续提供单版本完整 notes。

CoreApp 历史始终以 Nexus 为主，不因用户选择 GitHub update source 而改变。已加载页面使用独立 catalog JSON cache；该数据属于可重建远端目录，不是业务 SoT。离线时显示当前内置版本和最近成功缓存的页面。

## 6. Shared Contract 与 Typed SDK

不要继续把双语内容压进 `GitHubRelease.body`。在 `packages/utils` 增加 release-notes domain types、normalizer 与以下 Update SDK 能力：

```ts
getBundledReleaseNotes(): Promise<UpdateOpResponse<BundledReleaseNotesState>>
listReleaseNotes(input: { channel; cursor?; limit? }): Promise<UpdateOpResponse<ReleaseNotesPage>>
getReleaseNotes(input: { tag }): Promise<UpdateOpResponse<ReleaseNotesEntry>>
acknowledgeReleaseNotes(input: { version }): Promise<UpdateOpResponse>
```

Nexus、GitHub metadata asset、打包 catalog 都在 main/service 边界从 `unknown` 归一化为同一 `ReleaseNotesEntry`。Renderer 只消费 typed SDK，不直接 fetch Nexus、不读取文件、不重新定义 payload。

更新发现路径可暂时保留 `body` 兼容旧消费者，但新 UI 必须读取 localized notes；待所有消费者切换后再独立清理 `body`。

## 7. 本地已读状态与启动规则

新增 SQLite 本地状态（使用实现时的下一个可用 migration 编号），保存最后确认的版本；不放入会云同步的 `APP_SETTING`：

```text
app_release_notes_state(
  id = 1,
  last_acknowledged_version,
  updated_at
)
```

规则：

- onboarding 未完成且无状态：静默确认当前版本，视为首次安装。
- onboarding 已完成且无状态：视为功能首次覆盖到既有 profile，只展示当前版本；确认后建立基线。
- `current > lastAcknowledged`：从内置 catalog 聚合区间内所有 Release/Beta summary，包括跨渠道版本。
- `current <= lastAcknowledged`：同版本、降级、回滚均不展示。
- 仅用户关闭弹窗或进入完整日志后确认；渲染失败、异常退出不写状态。

状态由 main SQLite repository 持久化；renderer 只发 acknowledge 命令。比较与聚合使用共享 semver helper，不用字符串比较。

## 8. CoreApp UI

### 8.1 首启弹窗

新增独立业务组件，不复用 `UpdatePromptDialog`：

- 仅主窗口、renderer ready 且 storage hydration 完成后评估。
- 标题随 locale：中文“本次更新”，英文 `What's Changed`。
- 单版本直接显示 Summary Notes；多版本按版本分组，目标版本展开，其他版本折叠并标注 Release/Beta。
- 主操作进入 `/setting?section=update&release=<tag>`；次操作关闭。
- 两个动作成功后才 acknowledge；导航失败不误记。
- Markdown/文本通过既有 safe renderer；切换语言即时重算，不持久化单语言内容。

### 8.2 Update 历史

把历史 UI 拆成 `SettingUpdate.vue` 下的独立业务组件，避免继续膨胀现有大文件：

- Release/Beta tabs，默认当前 update channel。
- Desktop：左侧版本列表、右侧详情；窄窗口：列表进入详情并可返回。
- 按发布时间从新到旧分页，列表标记 current/latest/legacy/channel。
- 选择当前内置版本优先使用 bundle；其他版本使用 Nexus detail/cache。
- Loading、empty、offline stale、legacy missing notes、parse failure 都有明确状态。
- 新增 user-facing copy 全部进入 CoreApp zh/en message catalogs；交互使用 TuffEx 语义控件与 keyboard/focus 行为。

`AppSettings.vue` 为 `SettingUpdate` 增加 `data-settings-section="update"` wrapper；query `release` 用于首启 CTA 定位详情。

## 9. 安全与兼容

- CoreApp 只渲染 Markdown 并调用既有 sanitizer，不消费 Nexus `notesHtml`。
- GitHub fallback 只接受官方仓库、目标 tag/version 匹配的 `tuff-release-notes.json`；日志资产不改变安装包 manifest/signature 信任边界。
- Legacy Nexus notes 允许展示但显式标记，不进入首启离线聚合。
- 新 Gateway 上线后移除 Release/Beta 的自动正文 fallback；Snapshot 保留现有生成策略或明确不展示。
- 日志加载/解析失败永不阻塞 App 启动、更新发现、下载或安装。

## 10. Rollout 与回滚

1. 先上线 parser/verify 与生成器测试，保持 UI 未启用。
2. 再上线 Nexus 分页和 typed SDK，旧 `/api/releases` 调用继续工作。
3. 再生成并打包 catalog，完成 packaged-resource smoke 后启用首启弹窗。
4. 最后接入 Update 历史 UI并移除 Release/Beta fallback。

回滚时可关闭首启触发和历史 UI，但不得恢复“缺 author 文档仍允许 Release/Beta 发布”的 silent fallback。Nexus API 新字段保持向后兼容；SQLite 单例表可保留，不做破坏性 down migration。

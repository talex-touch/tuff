# App Data Plugins 与 Everything 收口 Roadmap

> 状态：Roadmap / 进行中
> 更新时间：2026-06-21
> 范围：官方插件数据源、macOS App Data 搜索、Windows Everything 生产化收口
> 非目标：更新系统 Nexus Hard-Cut、AI Provider Registry、高级同步能力

## 1. North Star

让 Tuff 的搜索从“应用 + 文件 + 插件功能”扩展到“用户显式授权的本地 App 数据”，并把 Windows Everything 文件搜索从“已接入可用”推进到“可诊断、可回归、可受控发布”的生产状态。

- 产品目标：CoreBox 可统一搜索浏览器书签/历史、Obsidian、VSCode、Epic 项目与 macOS 典型 App 数据（如备忘录）等高频本地信息。
- 工程目标：所有新数据源通过官方插件或 typed provider 接入；不新增 raw channel / legacy SDK bypass；不把业务明文 dump 到 JSON 同步或日志。
- 平台目标：Windows Everything 明确 SDK/CLI 策略、路径授权过滤与真机 evidence；macOS App Data 明确权限、数据边界与降级 reason。

## 2. 当前基线

| 方向              | 当前状态                                                                                                                                                     | 缺口                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Browser Open      | 已有 `plugins/touch-browser-open`，支持 URL 打开、指定浏览器打开、网页搜索与搜索建议                                                                         | 不读取真实浏览器书签/历史；只记录最近使用浏览器                               |
| Browser Bookmarks | 已有 `plugins/touch-browser-bookmarks`，管理自有 `bookmarks.json` / `recent-urls.json`                                                                       | 不是 Chrome/Safari/Edge/Firefox 的真实书签/历史索引                           |
| Browser Data      | `plugins/touch-browser-data` 首版已新增，只读扫描 Chrome/Edge/Brave/Arc 的 Chromium `Bookmarks` JSON，支持 title/url/folder 搜索、打开 URL 与复制 URL action | History SQLite、Safari、持久索引/清理、真机 evidence 与 Store metadata 仍后置 |
| Obsidian          | 可通过 FileProvider 搜 `.md` 文件                                                                                                                            | 无 vault 配置、tag/frontmatter/backlink、`obsidian://` 打开能力               |
| VSCode            | AppProvider 能搜 VSCode 应用本身                                                                                                                             | 无 VSCode 扩展、workspace/recent project 搜索插件                             |
| Epic              | 未发现插件                                                                                                                                                   | 未定义 Epic 数据源类型、认证方式与项目检索模型                                |
| macOS App Data    | Spotlight provider 只搜默认目录文件名/display name                                                                                                           | 未接入 Notes/Reminders/Calendar/Contacts/Mail 等 App 数据                     |
| Everything        | Windows provider 已有 `sdk-napi -> cli -> unavailable`、设置页、diagnostics、CLI 手动选择、File Index watch-root 路径过滤与 fallback 单测                    | SDK 是否随包未闭环；缺 Windows 真机 evidence 与性能基线                       |

## 3. 总体原则

1. **Local-first / read-only first**：首版只读索引与打开动作，不做跨 App 写入、批量修改或自动同步。
2. **显式授权**：浏览器数据库、Obsidian vault、VSCode 目录、macOS App Data 均必须由用户显式启用；失败时展示 `unsupported/degraded reason`。
3. **SQLite SoT**：索引、状态、最近扫描游标优先进入 SQLite / 搜索索引；JSON 仅保存轻量配置，不保存完整业务明文 dump。
4. **最小留存**：历史记录默认限制数量/时间范围；支持按 source 清空索引。
5. **Typed SDK / Provider 优先**：插件通过官方 SDK 与 typed transport；缺能力时先补 SDK，不直接新增 legacy channel。
6. **可观测**：每个数据源必须暴露 health、lastIndexedAt、itemCount、lastError、permissionState、open target。
7. **可回滚**：每个数据源可单独禁用；禁用后不再搜索并可清理本地索引。

## 4. Roadmap

### M0 - 统一数据源与索引基线（先做）

| ID     | 事项                                                  | 验收                                                                                                       |
| ------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| DS-000 | 定义 `AppDataSource` / `PluginSearchIndexer` 最小接口 | source id、displayName、platform、permission、health、scan、search、open action 合同明确                   |
| DS-010 | 定义统一诊断字段                                      | CoreBox item 与 Settings diagnostics 都能展示 source、permissionState、lastError、itemCount、lastIndexedAt |
| DS-020 | 明确插件索引落点                                      | 不把书签/历史/备忘录全文 dump 到 JSON；索引进入 SQLite/search index 或插件受控本地索引                     |
| DS-030 | 建立清理/禁用语义                                     | 每个 source 支持 disable、clearIndex、rebuildIndex                                                         |

### M1 - Browser Data 官方插件

目标：在现有 `touch-browser-open` / `touch-browser-bookmarks` 基础上补一个真实浏览器数据插件，或把真实索引能力拆到 `touch-browser-data`。

| ID     | 事项                           | 范围                                                                                                                   |
| ------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| BR-010 | Chrome/Edge/Brave/Arc 书签索引 | 已落地首版：`touch-browser-data` 即时只读读取 Bookmarks JSON；支持 title/url/folder/browser 搜索，不持久化完整书签索引 |
| BR-020 | Chrome/Edge/Brave/Arc 历史索引 | 复制 SQLite 到临时只读副本后读取；默认限制最近 N 天/N 条                                                               |
| BR-030 | Safari 书签/历史调研           | 明确 macOS 权限、数据库位置、可行性与降级 reason                                                                       |
| BR-040 | CoreBox 打开动作               | 已落地默认打开 URL 与复制 URL action；指定浏览器打开与 browser-open capability diagnostics 复用后置                    |
| BR-050 | 迁移现有自管理收藏             | `touch-browser-bookmarks` 自有收藏保留为“Pinned / Manual bookmarks”，不伪装成浏览器真实数据                            |

首版非目标：同步浏览器账号数据、写回浏览器书签、绕过浏览器权限模型、读取 History SQLite、持久化完整书签索引。

### M2 - Obsidian 官方插件

| ID     | 事项                 | 验收                                                            |
| ------ | -------------------- | --------------------------------------------------------------- |
| OB-010 | Vault 配置           | 用户选择 vault root；支持多 vault；禁用/清理单 vault 索引       |
| OB-020 | Markdown 索引        | title、path、heading、tag、frontmatter、alias、mtime 搜索       |
| OB-030 | Backlink / link 解析 | 支持 `[[wiki-link]]` 与 markdown link 的轻量索引                |
| OB-040 | 打开动作             | 优先 `obsidian://open?vault=...&file=...`，失败回退系统打开文件 |
| OB-050 | 大 vault 策略        | 增量扫描、忽略 `.obsidian` 缓存目录、索引进度与错误列表         |

### M3 - VSCode 官方插件

| ID     | 事项                       | 验收                                                                                              |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------------- |
| VS-010 | Local extensions 索引      | 读取 `~/.vscode/extensions` / Insiders / VSCodium；搜索扩展名、publisher、description             |
| VS-020 | Recent workspaces/projects | 读取 VSCode storage 中最近项目；可按路径、名称搜索                                                |
| VS-030 | 打开动作                   | `code --reuse-window <path>` / `code --extensionDevelopmentPath` 可用性诊断；无 CLI 时展示 reason |
| VS-040 | Marketplace 后续评估       | 首版不联网；后续再评估 marketplace 搜索与 Nexus policy                                            |

### M4 - macOS App Data 插件/Provider

优先级按“可本地只读、权限清晰、用户价值高”排序。

| ID      | 数据源               | 首版范围                                                                 | 风险                              |
| ------- | -------------------- | ------------------------------------------------------------------------ | --------------------------------- |
| MAC-010 | Notes / 备忘录       | 调研本地只读索引与 Spotlight metadata 可行性；只提供明确授权/降级 reason | TCC、系统数据库格式变化、隐私风险 |
| MAC-020 | Reminders / Calendar | 调研只读事件/提醒标题检索与打开动作                                      | 权限授权与数据敏感度高            |
| MAC-030 | Contacts             | 只做显式授权后的姓名/公司/备注最小搜索评估                               | PII 敏感，默认不启用              |
| MAC-040 | Mail                 | 默认不进入首版；仅保留调研项                                             | 数据量大、隐私风险高、索引成本高  |

首版原则：如果不能做到用户可理解授权、可清理索引、可见降级原因，则不接入。

### M5 - Epic 项目检索插件

Epic 的定义需要先锁定：Epic Games Launcher 项目、Unreal/Epic Marketplace 项目，还是团队项目管理中的 Epic。

| ID     | 事项               | 验收                                                                            |
| ------ | ------------------ | ------------------------------------------------------------------------------- |
| EP-000 | 需求澄清           | 明确 Epic 指向、数据来源、认证方式、打开目标                                    |
| EP-010 | Local-first 可行性 | 若是 Unreal 项目，优先索引本地 `.uproject` 与最近项目                           |
| EP-020 | Remote API 策略    | 若需远端项目系统，必须走 Net SDK / secure secret / rate limit，不直连散落 fetch |

### M6 - Everything 生产化收口

| ID     | 事项                | 验收                                                                                                                                                                                                       |
| ------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EV-010 | SDK vs CLI 策略决策 | ✅ 正式目标锁定为随包 SDK/NAPI 优先，`es.exe` 作为显式恢复 fallback：`sdk-napi -> cli -> unavailable`                                                                                                      |
| EV-020 | SDK 打包闭环        | ✅ hosted run `29628880312` 完成 Windows snapshot、afterPack fail-closed 与 packaged `everything.js` / resource manifest / native addon 证据                                                               |
| EV-030 | CLI-only 闭环       | N/A：未选择 CLI-only；保留 CLI 路径探测、手动选择与清晰安装/恢复诊断                                                                                                                                       |
| EV-040 | 路径授权过滤        | 🟡 代码与回归已完成：Everything 结果继续经过 runtime root policy / File watch roots 过滤；真实 Windows evidence 待采                                                                                       |
| EV-050 | 诊断 evidence       | 🟡 backend、version、CLI path、fallback attempts、health、path filtering 与 bounded P50/P95/error/timeout/fallback 已完成；真实 SDK/CLI/unavailable artifact 已归档，待 packaged CoreBox manifest evidence |
| EV-060 | Windows 真机回归    | 🟡 hosted Windows SDK/CLI/unavailable 三态和 package gate 已通过；仍需普通搜索、显式 `@file`、结构化 filter 的交互式 packaged UI 截图/日志/evidence                                                        |
| EV-070 | 性能基线            | ✅ hosted Windows 各 200 样本：SDK P50/P95/max `2/3/4ms`、CLI `8/9/26ms`；query/path redaction、SDK fallback ratio `0`、exact unavailable errors 均通过                                                    |

## 5. 插件清单建议

| 插件           | 类型                  | 建议路径                                   | 优先级 | 说明                                             |
| -------------- | --------------------- | ------------------------------------------ | ------ | ------------------------------------------------ |
| Browser Data   | 新插件                | `plugins/touch-browser-data`               | P0     | 真实浏览器书签首版已落地；历史索引与 Safari 后置 |
| Obsidian       | 新插件                | `plugins/touch-obsidian`                   | P1     | Vault Markdown 搜索                              |
| VSCode         | 新插件                | `plugins/touch-vscode`                     | P1     | extensions + recent workspaces                   |
| macOS App Data | 新插件集合或 provider | `plugins/touch-macos-data` / core provider | P2     | Notes 等需权限调研                               |
| Epic           | 新插件                | `plugins/touch-epic`                       | P2     | 先澄清 Epic 定义                                 |

## 6. 验收清单

- [ ] 功能验收：每个插件至少覆盖搜索、打开、禁用、清理索引、错误降级。
- [ ] 权限验收：未授权时不扫描、不索引、不提示伪成功；展示明确 reason。
- [ ] 存储验收：无完整业务明文 JSON dump；无敏感信息进入日志/localStorage/同步 payload。
- [ ] 性能验收：冷启动不新增首屏阻塞；扫描任务后台化、可取消、可限速。
- [ ] 平台验收：Windows Everything 真机 evidence；macOS App Data 权限/降级 evidence。
- [ ] 文档验收：插件 README、Nexus docs、TODO/CHANGES/INDEX 状态一致。

## 7. 关联入口

- 搜索系统口径：`docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md`
- R3 收口清单：`docs/plan-prd/TODO-R3.md`
- Windows 文件搜索 PRD：`docs/plan-prd/03-features/search/WINDOWS-FILE-SEARCH-PRD.md`
- 当前执行清单：`docs/plan-prd/TODO.md`
- 质量基线：`docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`

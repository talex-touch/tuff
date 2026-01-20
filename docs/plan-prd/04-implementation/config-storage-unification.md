# 配置存储统一与同步策略（SQLite / JSON）

## 0. 目标与范围
- 目标：将本地配置统一收敛到 SQLite（适用于本机专有配置），多端同步所需数据保留 JSON 载荷通道。
- 范围：Core App 主配置、插件配置、少量前端本地存储；不覆盖业务数据表（如下载、搜索索引等）。

## 1. 当前存储盘点（Inventory）

### 1.1 主进程配置（StorageList）
> 存储位置：`<root>/config/<StorageList key>`  
> 存储格式：JSON 文本（即便扩展名为 `.ini` 也以 JSON 读取/写入）

| 配置项 | 存储位置 | 介质/格式 | Owner | Sync 需求 | 读写频率 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| APP_SETTING | `config/app-setting.ini` | JSON | Core App 设置 | 待评估 | 高 | hot config |
| SHORTCUT_SETTING | `config/shortcut-setting.ini` | JSON | 快捷键 | 待评估 | 中 | |
| OPENERS | `config/openers.json` | JSON | 文件打开器 | 待评估 | 低 | |
| FILE_INDEX_SETTINGS | `config/file-index-settings.json` | JSON | 文件索引 | 本地 | 低 | 机器相关 |
| APP_INDEX_SETTINGS | `config/app-index-settings.json` | JSON | 应用索引 | 本地 | 低 | 机器相关 |
| DEVICE_IDLE_SETTINGS | `config/device-idle-settings.json` | JSON | 设备空闲 | 本地 | 低 | 机器相关 |
| IntelligenceConfig | `config/aisdk-config` | JSON | AI SDK 配置 | 本地 | 中 | 敏感 |
| MARKET_SOURCES | `config/market-sources.json` | JSON | 插件市场源 | 待评估 | 低 | |
| THEME_STYLE | `config/theme-style.ini` | JSON | 主题样式 | 待评估 | 中 | |
| SEARCH_ENGINE_LOGS_ENABLED | `config/search-engine-logs-enabled` | JSON | 搜索日志 | 本地 | 低 | |
| EVERYTHING_SETTINGS | `config/everything-settings.json` | JSON | Everything | 本地 | 低 | Windows 专用 |
| FLOW_CONSENT | `config/flow-consent.json` | JSON | Flow 授权 | 本地 | 低 | |
| SENTRY_CONFIG | `config/sentry-config.json` | JSON | Sentry 配置 | 本地 | 低 | |
| NOTIFICATION_CENTER | `config/notification-center.json` | JSON | 通知中心 | 本地 | 低 | |
| STARTUP_ANALYTICS | `config/startup-analytics.json` | JSON | 启动分析 | 本地 | 低 | |
| STARTUP_ANALYTICS_REPORT_QUEUE | `config/startup-analytics-report-queue.json` | JSON | 启动上报队列 | 本地 | 低 | |
| TELEMETRY_CLIENT | `config/telemetry-client.json` | JSON | 端侧 Telemetry | 本地 | 低 | |

### 1.2 插件配置（文件 + SQLite）
| 配置项 | 存储位置 | 介质/格式 | Owner | Sync 需求 | 读写频率 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| Plugin 配置文件 | `config/plugins/<plugin>.json` | JSON | Plugin Storage | 待评估 | 中 | 单插件 10MB 限制 |
| plugin_data | SQLite 表 `plugin_data` | JSON 字符串 | 插件元数据 | 本地 | 低 | key-value |

### 1.3 SQLite 配置类表
| 配置项 | 存储位置 | 介质/格式 | Owner | Sync 需求 | 读写频率 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| config | SQLite 表 `config` | JSON 字符串 | 全局配置 | 本地 | 低 | key-value |

### 1.4 Tuffex（前端本地存储）
| 配置项 | 存储位置 | 介质/格式 | Owner | Sync 需求 | 读写频率 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| TxGroupBlock 展开状态 | `localStorage` | JSON | 组件状态 | 本地 | 中 | key 前缀 `tuff-block-storage-` |

### 1.5 共享工具层（packages/utils）
| 配置项 | 存储位置 | 介质/格式 | Owner | Sync 需求 | 读写频率 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| app-settings storage client | Renderer 侧 | JSON | utils/renderer/storage | 继承主配置 | 中 | 代理 `APP_SETTING` |
| openers storage client | Renderer 侧 | JSON | utils/renderer/storage | 继承主配置 | 低 | 代理 `OPENERS` |
| intelligence storage client | Renderer 侧 | JSON | utils/renderer/storage | 继承主配置 | 中 | 代理 `IntelligenceConfig` |

## 2. 分类矩阵（SQLite / JSON / 本地缓存）
| 分类 | 适用范围 | 目标介质 | 典型示例 |
| --- | --- | --- | --- |
| Local-only | 机器相关、敏感、不需要同步 | SQLite | 文件索引、设备空闲 |
| Sync-needed | 需跨设备一致 | JSON 载荷（同步通道） | 主题、快捷键（待评估） |
| Ephemeral | 临时/可重建 | 内存/缓存 | 搜索中间态 |

### 2.1 条目级分类结果（初版）
| 配置项 | 分类 | 目标介质 | Owner | 备注/截止 |
| --- | --- | --- | --- | --- |
| APP_SETTING | TBD | SQLite + JSON(sync payload) | Core App | 需拆分字段，截止 TBD |
| SHORTCUT_SETTING | Sync-needed | JSON(sync payload) + SQLite cache | Core App | 需确认同步范围，截止 TBD |
| OPENERS | Local-only | SQLite | Core App | 机器相关 |
| FILE_INDEX_SETTINGS | Local-only | SQLite | File Provider | 机器相关 |
| APP_INDEX_SETTINGS | Local-only | SQLite | App Provider | 机器相关 |
| DEVICE_IDLE_SETTINGS | Local-only | SQLite | Core App | 机器相关 |
| IntelligenceConfig | Local-only | SQLite | AI SDK | 敏感配置 |
| MARKET_SOURCES | TBD | SQLite + JSON(sync payload) | Market | 需确认是否同步 |
| THEME_STYLE | Sync-needed | JSON(sync payload) + SQLite cache | Core App | 主题偏好 |
| SEARCH_ENGINE_LOGS_ENABLED | Local-only | SQLite | Search Engine | |
| EVERYTHING_SETTINGS | Local-only | SQLite | Windows Provider | |
| FLOW_CONSENT | Local-only | SQLite | Flow | |
| SENTRY_CONFIG | Local-only | SQLite | Sentry | |
| NOTIFICATION_CENTER | Local-only | SQLite | Notification | |
| STARTUP_ANALYTICS | Local-only | SQLite | Analytics | |
| STARTUP_ANALYTICS_REPORT_QUEUE | Local-only | SQLite | Analytics | |
| TELEMETRY_CLIENT | Local-only | SQLite | Telemetry | |
| Plugin 配置文件 | TBD | JSON(sync payload) + SQLite cache | Plugin | 需按插件声明决定 |
| plugin_data | Local-only | SQLite | Plugin | 元数据 |
| config | Local-only | SQLite | Core App | 全局键值 |
| TxGroupBlock 展开状态 | Local-only | localStorage | Tuffex | 前端组件态 |

## 3. Source of Truth 规则（草案）
- SQLite 为本地权威来源；JSON 仅作为同步载荷与落盘中间形态。
- 同步需要显式标记：未标记的配置默认为 Local-only。
- 写入方向：
  - Local-only：SQLite 为唯一写入点，Renderer 通过 IPC 读写。
  - Sync-needed：本地写入 SQLite -> 同步适配器生成 JSON 载荷 -> 服务端/云端；同步回流写入 SQLite 缓存。
- 冲突解决：
  - 默认策略：基于 `updatedAt` 的 last-write-wins（记录冲突日志）。
  - 对敏感配置（如 AI Key）：禁止自动合并，提示用户确认。
- Owner sign-off：TBD（状态：pending）

## 4. 存储抽象与版本策略（草案）
### 4.1 接口草案
- `get(key) -> { data, version }`
- `set(key, data, clientVersion?) -> { success, version, conflict? }`
- `delete(key) -> { success }`
- `list(prefix?) -> Array<{ key, version }>`
- `subscribe(key, handler) -> disposer`

### 4.2 版本策略
- 每个 key 维护单调递增 `version`。
- SQLite：版本随写入事务递增并持久化。
- JSON：版本来源于存储模块缓存版本；同步回流时强制对齐。

### 4.3 JSON ↔ SQLite 行为映射
| 操作 | SQLiteAdapter | JsonAdapter |
| --- | --- | --- |
| get | 读表 + 读缓存 | 读文件 + 缓存 |
| set | 事务写入 + 版本递增 | 写入 JSON 载荷 + 更新缓存版本 |
| delete | 删除行 | 写空对象或删除文件 |
| list | key 前缀扫描 | 文件名枚举 |
| subscribe | 监听表变更 | 监听文件变更 |

## 5. 迁移与回滚（草案）
- Read fallback：SQLite miss -> JSON -> default。
- One-time import：启动时迁移并标记版本。
- Rollback：写回旧 JSON 并保留 SQLite 快照。

### 5.1 迁移清单（初版）
| 配置项 | 迁移路径 | Fallback | 回滚触发 |
| --- | --- | --- | --- |
| FILE_INDEX_SETTINGS | JSON 文件 -> SQLite | SQLite miss -> JSON | 数据校验不一致 |
| APP_INDEX_SETTINGS | JSON 文件 -> SQLite | SQLite miss -> JSON | 读写失败 |
| DEVICE_IDLE_SETTINGS | JSON 文件 -> SQLite | SQLite miss -> JSON | 数据校验不一致 |
| SEARCH_ENGINE_LOGS_ENABLED | JSON 文件 -> SQLite | SQLite miss -> JSON | 读写失败 |
| EVERYTHING_SETTINGS | JSON 文件 -> SQLite | SQLite miss -> JSON | 读写失败 |
| FLOW_CONSENT | JSON 文件 -> SQLite | SQLite miss -> JSON | 数据校验不一致 |
| SENTRY_CONFIG | JSON 文件 -> SQLite | SQLite miss -> JSON | 读写失败 |
| NOTIFICATION_CENTER | JSON 文件 -> SQLite | SQLite miss -> JSON | 数据校验不一致 |
| STARTUP_ANALYTICS | JSON 文件 -> SQLite | SQLite miss -> JSON | 数据校验不一致 |
| STARTUP_ANALYTICS_REPORT_QUEUE | JSON 文件 -> SQLite | SQLite miss -> JSON | 读写失败 |
| TELEMETRY_CLIENT | JSON 文件 -> SQLite | SQLite miss -> JSON | 读写失败 |
| plugin_data | SQLite 原位维护 | N/A | 迁移不涉及 |
| config | SQLite 原位维护 | N/A | 迁移不涉及 |
| APP_SETTING / THEME_STYLE / SHORTCUT_SETTING | 拆分字段后迁移 | 字段级 fallback | 冲突不可合并 |
| MARKET_SOURCES / Plugin 配置 | 依赖同步方案后迁移 | JSON 兜底 | 同步冲突 |

## 6. 进展清单（对齐 issues）
- [x] 盘点现有配置项（CFG-010）
- [x] 分类矩阵与目标存储策略（CFG-020）
- [x] Source-of-truth 决策与冲突规则（CFG-030）
- [x] 存储抽象设计（CFG-040）
- [x] 迁移与回滚方案（CFG-050）
- [x] 权限中心 PRD/TODO 对齐（CFG-060）
- [x] 统一进展文档（CFG-070）
- [x] 试点迁移与验证门禁（CFG-080）

### 6.1 试点迁移与验证门禁（CFG-080）
- 试点项：`StorageList.SEARCH_ENGINE_LOGS_ENABLED`（`config/search-engine-logs-enabled`）。
- 写入路径：读取 JSON -> 规范化 -> upsert SQLite `config` 表；写入后回表读取比对，确保一致。
- Fallback：SQLite 不可用或写入失败时，仅记录告警日志，JSON 仍为读取来源。
- 验证门禁（文档化，按需执行）：
  - lint：`pnpm lint`
  - typecheck：`pnpm -C "apps/core-app" run typecheck:node`
  - unit：`pnpm utils:test`
- 人工校验：启动主进程后检查 `config` 表中该 key 与 JSON 内容一致。

## 7. 相关 PRD/计划
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/03-features/plugin/permission-center-prd.md`
- `docs/plan-prd/03-features/search/EVERYTHING-SDK-INTEGRATION-PRD.md`
- `docs/plan-prd/04-implementation/CoreAppRefactor260111.md`

## 8. 执行方式（How-to）
1. 先补齐本地配置盘点与分类，确认 Local-only 与 Sync-needed 边界。
2. 明确 source-of-truth 与冲突规则，落盘到本文档并记录 sign-off 状态。
3. 设计存储抽象与迁移清单，优先选择低风险配置试点。
4. 对齐 PRD/TODO 文档状态，保证“代码为准”的可追踪性。
5. 小步迁移 + 回滚验证，再逐步扩大覆盖面。

## 9. 当前状态总览
| 工作项 | 状态 | 证据 |
| --- | --- | --- |
| CFG-010 盘点现有配置项 | 已完成 | 本文档 1.x |
| CFG-020 分类矩阵与目标策略 | 已完成 | 本文档 2.x |
| CFG-030 Source-of-truth 规则 | 已完成 | 本文档 3.x |
| CFG-040 存储抽象设计 | 已完成 | 本文档 4.x |
| CFG-050 迁移与回滚方案 | 已完成 | 本文档 5.x |
| CFG-060 权限中心 PRD/TODO 对齐 | 已完成 | `docs/plan-prd/03-features/plugin/permission-center-prd.md` |
| CFG-070 统一进展文档 | 已完成 | 本文档 |
| CFG-080 试点迁移与验证门禁 | 已完成 | 本文档 6.1 |

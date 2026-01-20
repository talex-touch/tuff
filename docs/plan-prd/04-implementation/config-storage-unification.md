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

## 4. 存储抽象与版本策略（草案）
- StorageAdapter：`get/set/delete/list` + `version` 字段。
- SQLiteAdapter：事务写入 + 版本递增 + 读缓存。
- JsonAdapter：序列化载荷 + 同步冲突交给上层 resolver。

## 5. 迁移与回滚（草案）
- Read fallback：SQLite miss -> JSON -> default。
- One-time import：启动时迁移并标记版本。
- Rollback：写回旧 JSON 并保留 SQLite 快照。

## 6. 进展清单（对齐 issues）
- [x] 盘点现有配置项（CFG-010）
- [x] 分类矩阵与目标存储策略（CFG-020）
- [ ] Source-of-truth 决策与冲突规则（CFG-030）
- [ ] 存储抽象设计（CFG-040）
- [ ] 迁移与回滚方案（CFG-050）
- [ ] 权限中心 PRD/TODO 对齐（CFG-060）
- [ ] 统一进展文档（CFG-070）
- [ ] 试点迁移与验证门禁（CFG-080）

## 7. 相关 PRD/计划
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/03-features/plugin/permission-center-prd.md`
- `docs/plan-prd/03-features/search/EVERYTHING-SDK-INTEGRATION-PRD.md`
- `docs/plan-prd/04-implementation/CoreAppRefactor260111.md`

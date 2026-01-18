# PRD: GitHub 自动更新与下载包可视化 (v1.0)

## 1. 背景与目标

当前更新系统已具备 GitHub Release 检查、下载中心集成与提示更新的基础能力，但需要明确以下产品方向：

- **自动下载并重启完成更新**：确保用户能在新版本可用时自动完成下载，并以“重启完成更新”的方式交付。
- **查看 GitHub 下载包**：在 UI 中提供 GitHub Release 资产列表（平台/架构/大小/校验），便于用户了解具体下载包。
- **缓存与限频**：避免频繁请求 GitHub API 触发限流或封禁，同时保证更新信息“足够新鲜”。

目标是基于现有 UpdateService + DownloadCenter 架构，补齐 **“可视化 + 限频 + 自动化”** 的产品体验闭环。

## 2. 范围与非目标

### 2.1 范围
- GitHub Releases 作为更新源，支持 Release/Beta/Snapshot 渠道的版本获取。
- 自动更新流程：检查 → 自动下载 → 校验 → 重启安装提示。
- 更新设置增强：缓存策略、检查频率、自动下载开关、重启提醒策略。
- GitHub Release 资产清单展示与下载任务入口。

### 2.2 非目标
- 不引入新的发布源（官方源、私有源）作为默认主路径。
- 不做增量/差分更新（仅全量包）。
- 不引入账号级 GitHub Token 登录（保持公开访问）。

## 3. 用户场景

- **用户 A（自动更新）**：在后台自动下载新版本，收到“重启完成更新”提示，点击后完成更新。
- **用户 B（手动了解）**：在设置页查看 GitHub Release 的各平台包，确认是否存在适配包并选择下载。
- **用户 C（频繁启动）**：频繁启动应用也不会触发过多 GitHub API 请求，更新状态稳定可靠。

## 4. 功能需求

### 4.1 自动检查与自动下载

- **默认策略**：启动时检查 + 周期检查（频率可配置）。
- **自动下载**：检测到新版本后，自动向 DownloadCenter 发起下载任务（优先级 CRITICAL）。
- **安装提示**：
  - 下载完成后提示“重启以完成更新”。
  - 若用户选择稍后，需在下一次应用启动或闲置时再次提示。

### 4.2 GitHub Release 列表与资产清单

- **列表视图**：
  - 版本号、发布时间、渠道标签、Release Notes 摘要。
  - 支持按渠道筛选（Release / Beta / Snapshot）。
- **资产清单**：
  - 平台、架构、文件名、大小、SHA256（若可用）。
  - 操作：复制下载链接 / 发起下载任务 / 打开 Release 页面。
- **资产来源**：基于 GitHub Release `assets` 字段解析，按命名规则识别平台与架构。

### 4.3 缓存与限频策略

- **条件请求**：支持 `ETag` / `Last-Modified`，收到 `304` 则复用本地缓存。
- **缓存 TTL**：
  - 默认 `60 分钟`（可配置），避免频繁请求。
  - 强制检查（用户主动点击“检查更新”）可跳过 TTL，但仍使用条件请求。
- **限频保护**：
  - 记录 `X-RateLimit-Remaining` / `X-RateLimit-Reset`（若存在）。
  - 当 remaining 低于阈值（如 < 10）时，临时延长检查间隔，并提示“检查频率已自动降低”。
  - 失败退避：连续失败触发指数退避（1m/5m/15m/1h）。

### 4.4 设置项扩展

新增/完善设置：

- `update.autoCheck`：是否自动检查
- `update.frequency`：启动/每日/每周/从不
- `update.autoDownload`：自动下载更新
- `update.cacheEnabled`：是否启用缓存
- `update.cacheTTL`：缓存有效期（分钟）
- `update.rateLimitGuard`：限频保护开关

### 4.5 错误与回退

- GitHub 请求失败 → 使用缓存结果（若存在），UI 标注为“缓存数据”。
- 缓存过期且请求失败 → 展示“暂时无法获取更新”，不影响应用正常使用。
- 下载失败 → 提供重试、查看错误日志入口（复用 DownloadCenter）。

## 5. 数据结构

### 5.1 缓存结构（建议本地 JSON）

```ts
interface GithubReleaseCache {
  channel: 'RELEASE' | 'BETA' | 'SNAPSHOT'
  etag?: string
  lastModified?: string
  fetchedAt: number
  ttlMinutes: number
  releases: GithubReleaseSummary[]
  rateLimit?: {
    remaining?: number
    resetAt?: number
  }
}
```

### 5.2 资产解析结构

```ts
interface ReleaseAssetView {
  name: string
  platform: 'darwin' | 'win32' | 'linux' | 'unknown'
  arch: 'x64' | 'arm64' | 'universal' | 'unknown'
  size: number
  downloadUrl: string
  sha256?: string
}
```

## 6. 交互流程

### 6.1 自动更新流程

1. 启动或定时触发 `update:check`
2. 读取缓存并发送条件请求（ETag / Last-Modified）
3. 若有新版本：
   - 自动下载 → 校验 SHA256 → 标记“可安装”
4. 展示“重启完成更新”提示
5. 用户重启 → 更新安装 → 新版本启动

### 6.2 资产查看流程

1. 设置页进入“更新”
2. 拉取缓存或 GitHub Release 列表
3. 展示资产清单 + 操作入口
4. 用户选择下载 → 进入 DownloadCenter

## 7. 技术方案概述

### 7.1 主进程（UpdateService / UpdateSystem）

- 在 `UpdateService` 中扩展缓存读取与条件请求逻辑。
- 更新下载仍由 `UpdateSystem` 调度至 DownloadCenter。
- 缓存建议保存至 `config/update-cache.json`（避免污染设置文件）。

### 7.2 渲染进程（UpdateProvider）

- `GithubUpdateProvider` 支持获取 Release 资产清单。
- UI 增加“查看 GitHub 下载包”入口，可复用 DownloadCenter 组件。

### 7.3 IPC 增补（示例）

- `update:list-releases` → 获取 Release 列表（含缓存标识）
- `update:get-release-assets` → 获取单个 Release 资产
- `update:get-cache-status` → 获取缓存/限频状态

## 8. 非功能需求

- **性能**：检查更新接口 ≤ 500ms（命中缓存）。
- **稳定性**：遇到 GitHub 429/403 时自动退避，不影响正常启动。
- **安全性**：只信任官方仓库 `talex-touch/tuff` 的 Release 资产。
- **可观测性**：日志记录请求次数、缓存命中率、限频触发次数。

## 9. 验收标准

- 自动更新流程可在 3 次以内操作完成（检查 → 下载 → 重启）。
- “查看 GitHub 下载包”可展示完整资产列表并可发起下载。
- 在连续启动/高频检查场景下，仍能保持 GitHub API 可用且不触发封禁。
- 当 GitHub API 不可用时，应用依旧可正常运行并显示合理提示。

## 10. 风险与待决问题

- **资产命名规则**：不同平台包命名不一致时解析准确性下降，需明确规则或提供手工映射。
- **无 Token 限速**：公开 API 受限，需要评估实际请求量与合理 TTL。
- **校验码来源**：若 Release 未提供 SHA256，是否允许仅依赖 TLS？
- **重启时机**：下载完成后是否允许“静默重启”需要产品决策。

## 11. 实施计划（建议）

1. **更新缓存与限频**：实现 ETag/TTL/退避逻辑，补充设置项。
2. **GitHub 资产可视化**：Release 列表 + 资产清单 UI。
3. **自动下载 + 重启提示**：联动 DownloadCenter 与更新提示组件。
4. **观测与测试**：添加限频场景、缓存命中、离线降级用例。

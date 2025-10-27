# Talex Touch 应用更新系统产品需求文档 (PRD)

## 一、产品背景

### 1.1 现状分析

Talex Touch 应用目前使用 GitHub Releases API 进行版本检测和更新提醒。当有新版本发布时，应用会：

- 从 `https://api.github.com/repos/talex-touch/tuff/releases` 获取版本信息
- 解析版本号并与当前版本比较
- 显示更新弹窗，引导用户跳转到 GitHub Release 页面下载

### 1.2 核心痛点

1. **网络访问受限**：部分用户因网络环境无法访问 GitHub API 和 Release 页面
2. **下载功能缺失**：当前仅提供跳转链接，未实现应用内下载功能
3. **单一更新源**：完全依赖 GitHub，缺乏扩展性
4. **错误处理不足**：网络请求失败时缺乏友好的错误提示
5. **国际化缺失**：所有提示文案硬编码，不支持多语言

## 二、产品目标

### 2.1 核心目标

- 使用OOP策略模式抽象不同更新源的实现逻辑，便于扩展
- 当GitHub不可访问时，提供清晰的错误提示和备选方案
- 通过统一下载中心提供应用内下载功能
- 全面支持i18n国际化，所有用户可见文案可本地化

### 2.2 非目标

- 本期不实现自动静默更新（后续可扩展）
- 本期不实现增量更新或热更新
- 本期不实现官方更新源（预留接口）

## 三、功能需求

### 3.1 多更新源架构（OOP抽象）

#### 3.1.1 更新源抽象接口

使用策略模式抽象不同更新源的实现：

```typescript
// 更新源基类
abstract class UpdateProvider {
  abstract readonly name: string
  abstract readonly type: UpdateProviderType

  // 检查是否可以处理该配置
  abstract canHandle(config: UpdateSourceConfig): boolean

  // 获取最新版本信息
  abstract fetchLatestRelease(channel: AppPreviewChannel): Promise<GitHubRelease>

  // 获取下载资源列表
  abstract getDownloadAssets(release: GitHubRelease): DownloadAsset[]

  // 健康检查（可选）
  async healthCheck?(): Promise<boolean>
}

enum UpdateProviderType {
  GITHUB = 'github',
  OFFICIAL = 'official',  // 官方网站（未来实现）
  CUSTOM = 'custom'       // 自定义源
}
```

#### 3.1.2 支持的更新源实现

**1. GitHub Provider（默认启用）**

```typescript
class GithubUpdateProvider extends UpdateProvider {
  readonly name = 'GitHub Releases'
  readonly type = UpdateProviderType.GITHUB

  async fetchLatestRelease(channel: AppPreviewChannel): Promise<GitHubRelease> {
    const url = 'https://api.github.com/repos/talex-touch/tuff/releases'
    const response = await axios.get(url, { timeout: 8000 })
    // 过滤并返回最新版本
  }

  async healthCheck(): Promise<boolean> {
    try {
      await axios.get('https://api.github.com', { timeout: 5000 })
      return true
    } catch {
      return false
    }
  }
}
```

**2. Official Provider（预留接口，暂不实现）**

```typescript
class OfficialUpdateProvider extends UpdateProvider {
  readonly name = 'Official Website'
  readonly type = UpdateProviderType.OFFICIAL

  async fetchLatestRelease(channel: AppPreviewChannel): Promise<GitHubRelease> {
    // TODO: 等待官方服务端实现
    throw new Error('Official update server is not ready yet')
  }
}
```

**3. Custom Provider（用户自定义）**

```typescript
class CustomUpdateProvider extends UpdateProvider {
  readonly name: string
  readonly type = UpdateProviderType.CUSTOM
  private readonly apiUrl: string

  constructor(config: CustomUpdateConfig) {
    this.name = config.name
    this.apiUrl = config.apiUrl
  }

  async fetchLatestRelease(channel: AppPreviewChannel): Promise<GitHubRelease> {
    // 使用自定义API（需兼容GitHub API格式）
  }
}
```

#### 3.1.3 更新源管理器

```typescript
class UpdateProviderManager {
  private providers: UpdateProvider[] = []
  private activeProvider: UpdateProvider | null = null

  // 注册Provider
  registerProvider(provider: UpdateProvider): void

  // 根据用户配置选择Provider
  selectProvider(config: UpdateSourceConfig): UpdateProvider | null

  // 检查更新（使用当前激活的Provider）
  async checkUpdate(): Promise<GitHubRelease | null>
}
```

#### 3.1.4 用户配置与选择

用户在设置中可选择更新源：
- **GitHub（默认）**：直接访问GitHub API
- **官方网站**：灰色显示"即将推出"
- **自定义源**：用户输入API地址（高级选项）

### 3.2 版本检测逻辑

#### 3.2.1 版本格式支持
- **MASTER 渠道**：`v1.0.0` 或 `1.0.0`
- **SNAPSHOT 渠道**：`v1.0.0-SNAPSHOT` 或 `1.0.0-SNAPSHOT`

#### 3.2.2 版本比较规则（保持现有逻辑）
优先级：`渠道 > 主版本号 > 次版本号 > 修订号`
- SNAPSHOT 渠道视为高于 MASTER 渠道

#### 3.2.3 渠道过滤
- 仅检测与当前应用相同渠道的更新
- 用户可在设置中选择"允许跨渠道更新提醒"

### 3.3 错误处理与降级

#### 3.3.1 GitHub访问失败处理
```typescript
// 伪代码逻辑
async function checkUpdate(): Promise<GitHubRelease | null> {
  try {
    const provider = UpdateProviderManager.getActiveProvider()
    const release = await provider.fetchLatestRelease(currentChannel)
    return release
  } catch (error) {
    if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') {
      // 显示网络错误提示
      showNetworkErrorDialog()
      return null
    }
    throw error
  }
}
```

#### 3.3.2 用户友好的错误提示
- **网络错误**：`i18n.t('update.network_error')` - "无法连接到更新服务器，请检查网络连接"
- **超时错误**：`i18n.t('update.timeout_error')` - "更新检查超时，请稍后重试"
- **API错误**：`i18n.t('update.api_error')` - "更新服务器暂时不可用，请稍后重试"

### 3.4 用户界面

#### 3.4.1 更新弹窗增强
当前弹窗 (`AppUpgradationView.vue`) 需增强：

**新增元素**：
- 版本号对比（当前版本 → 新版本）
- 更新内容预览（Markdown 渲染，已实现）
- 下载大小显示
- 更新源信息显示
- 下载进度条（下载中时显示）

**按钮组**：
- `i18n.t('update.later')` - "稍后提醒"：延迟到下次启动
- `i18n.t('update.ignore')` - "忽略此版本"：跳过当前版本更新提醒
- `i18n.t('update.download')` - "立即下载"：通过下载中心下载
- `i18n.t('update.browser')` - "浏览器打开"：跳转到 Release 页面（备用）

#### 3.4.2 设置页面新增项
在应用设置中增加"更新设置"模块：

**更新源选择**：
- `i18n.t('update.source.github')` - "GitHub Releases（推荐）"
- `i18n.t('update.source.official')` - "官方网站（即将推出）"（灰色禁用）
- `i18n.t('update.source.custom')` - "自定义源"（高级选项）

**更新检查设置**：
- `i18n.t('update.check_auto')` - "自动检查更新"（开关）
- `i18n.t('update.check_frequency')` - "检查频率"（每次启动/每天/每周/手动）
- `i18n.t('update.cross_channel')` - "允许跨渠道更新提醒"（开关）

### 3.5 国际化支持

#### 3.5.1 i18n Key 清单

**更新弹窗文案**：
```json
{
  "update": {
    "title": "发现新版本",
    "current_version": "当前版本",
    "new_version": "新版本",
    "release_notes": "更新内容",
    "download_size": "下载大小",
    "source": "更新源",
    "later": "稍后提醒",
    "ignore": "忽略此版本",
    "download": "立即下载",
    "browser": "浏览器打开"
  }
}
```

**错误提示文案**：
```json
{
  "update": {
    "network_error": "无法连接到更新服务器，请检查网络连接",
    "timeout_error": "更新检查超时，请稍后重试",
    "api_error": "更新服务器暂时不可用，请稍后重试",
    "no_update": "当前已是最新版本",
    "check_failed": "更新检查失败"
  }
}
```

**设置页面文案**：
```json
{
  "settings": {
    "update": {
      "title": "更新设置",
      "source": "更新源",
      "check_auto": "自动检查更新",
      "check_frequency": "检查频率",
      "cross_channel": "允许跨渠道更新提醒",
      "frequency": {
        "startup": "每次启动",
        "daily": "每天",
        "weekly": "每周",
        "manual": "手动"
      }
    }
  }
}
```

## 四、技术设计

### 4.1 文件结构调整

**核心文件**：`apps/core-app/src/renderer/src/modules/hooks/useUpdate.ts`

**新增文件**：
- `apps/core-app/src/renderer/src/modules/update/UpdateProvider.ts` - 更新源抽象
- `apps/core-app/src/renderer/src/modules/update/GithubUpdateProvider.ts` - GitHub源实现
- `apps/core-app/src/renderer/src/modules/update/OfficialUpdateProvider.ts` - 官方源实现
- `apps/core-app/src/renderer/src/modules/update/CustomUpdateProvider.ts` - 自定义源实现
- `apps/core-app/src/renderer/src/modules/update/UpdateProviderManager.ts` - 源管理器

### 4.2 类型定义

```typescript
export interface UpdateSourceConfig {
  type: UpdateProviderType
  name: string
  url?: string
  enabled: boolean
  priority: number
}

export interface DownloadAsset {
  name: string
  url: string
  size: number
  platform: 'win32' | 'darwin' | 'linux'
  arch: 'x64' | 'arm64'
  checksum?: string
}

export interface UpdateCheckResult {
  hasUpdate: boolean
  release?: GitHubRelease
  error?: string
  source: string
}
```

### 4.3 主进程支持
需在主进程新增 IPC 通道：
- `app-update:check` - 检查更新
- `app-update:download` - 启动下载
- `app-update:download-progress` - 下载进度回调
- `app-update:download-complete` - 下载完成
- `app-update:open-installer` - 打开安装包

参考现有的 Channel 系统实现（`apps/core-app/src/main/core/channel-core.ts`）

### 4.4 配置管理
使用现有的 StorageModule 存储更新设置：
- 配置文件：`<root>/config/app-update-settings.json`
- 包含：更新源配置、检查频率、跳过的版本号等

## 五、UI/UX设计

### 5.1 更新弹窗界面

**布局结构**：
```
┌─────────────────────────────────────┐
│  🎉 发现新版本 v2.1.0                │
├─────────────────────────────────────┤
│  当前版本: v2.0.5                    │
│  新版本: v2.1.0                      │
│  更新源: GitHub Releases             │
│  下载大小: 45.2 MB                   │
├─────────────────────────────────────┤
│  ## 更新内容                         │
│  - 新增功能A                        │
│  - 修复问题B                        │
│  - 性能优化C                        │
├─────────────────────────────────────┤
│  [稍后提醒] [忽略此版本] [立即下载]   │
└─────────────────────────────────────┘
```

### 5.2 设置页面界面

**更新设置模块**：
```
┌─────────────────────────────────────┐
│  📱 更新设置                         │
├─────────────────────────────────────┤
│  ✅ 自动检查更新                     │
│  检查频率: [每次启动 ▼]              │
│  更新源: [GitHub Releases ▼]        │
│  ✅ 允许跨渠道更新提醒               │
├─────────────────────────────────────┤
│  高级选项                           │
│  自定义源: [输入URL...]             │
└─────────────────────────────────────┘
```

## 六、安全考虑

### 6.1 文件校验
- 对下载的安装包进行 SHA256 校验（从 Release 信息获取 checksum）
- 校验失败时拒绝安装并提示用户

### 6.2 自定义更新源安全
- 用户添加自定义更新源时显示安全警告
- 要求用户确认信任该来源
- 记录自定义源的使用日志

### 6.3 HTTPS 强制
- 所有更新源必须使用 HTTPS 协议
- 拒绝 HTTP 明文传输的更新信息

## 七、实施计划

### 阶段一：OOP架构重构（2-3天）
- [ ] 创建 UpdateProvider 抽象基类
- [ ] 实现 GithubUpdateProvider
- [ ] 创建 UpdateProviderManager
- [ ] 重构现有 useUpdate 逻辑

### 阶段二：错误处理与i18n（1-2天）
- [ ] 实现网络错误处理逻辑
- [ ] 添加所有i18n文案
- [ ] 完善错误提示UI

### 阶段三：设置页面集成（2-3天）
- [ ] 在设置页面添加更新设置模块
- [ ] 实现更新源切换逻辑
- [ ] 添加自定义源配置

### 阶段四：UI增强（2-3天）
- [ ] 重构 AppUpgradationView.vue
- [ ] 添加版本对比显示
- [ ] 集成下载中心API

### 阶段五：测试与优化（1-2天）
- [ ] 单元测试（Provider切换逻辑）
- [ ] 集成测试（完整更新流程）
- [ ] 网络异常场景测试
- [ ] 性能优化

## 八、衡量指标

- **更新检测成功率**：≥ 95%（7 日均值）
- **用户更新率**：≥ 60%（检测到更新后7天内更新）
- **错误处理满意度**：≥ 90%（用户对错误提示的满意度）
- **国际化覆盖率**：100%（所有用户可见文案支持i18n）

## 九、风险与缓解

### 9.1 风险识别
1. **GitHub API限制**：可能遇到API频率限制
   - 缓解：实现指数退避重试机制

2. **自定义源安全风险**
   - 缓解：强制HTTPS、安全警告、审计日志

3. **版本比较逻辑复杂**
   - 缓解：充分测试各种版本格式，保持向后兼容

### 9.2 回滚方案
如新版本出现严重问题：
- 在GitHub Release中紧急下架或降级版本信息
- 提供版本回退指引文档

## 十、附录

### 10.1 相关文件清单
- `apps/core-app/src/renderer/src/modules/hooks/useUpdate.ts` - 核心更新逻辑
- `apps/core-app/src/renderer/src/base/axios.ts` - 网络请求封装
- `apps/core-app/src/renderer/src/components/base/AppUpgradationView.vue` - 更新弹窗
- `apps/core-app/src/renderer/src/AppEntrance.vue` - 应用入口（调用更新检查）
- `apps/core-app/src/main/core/channel-core.ts` - IPC通道系统

### 10.2 API接口设计

**GitHub API兼容格式**：
```json
{
  "tag_name": "v2.1.0",
  "name": "v2.1.0",
  "published_at": "2025-10-23T00:00:00Z",
  "body": "## What's New\n...",
  "assets": [
    {
      "name": "TalexTouch-2.1.0-win-x64.exe",
      "browser_download_url": "https://github.com/talex-touch/tuff/releases/download/v2.1.0/TalexTouch-2.1.0-win-x64.exe",
      "size": 52428800,
      "checksum": "sha256:abcd1234..."
    }
  ]
}
```

### 10.3 配置示例

**更新设置配置**：
```json
{
  "update": {
    "enabled": true,
    "frequency": "startup",
    "source": {
      "type": "github",
      "name": "GitHub Releases",
      "url": "https://api.github.com/repos/talex-touch/tuff/releases"
    },
    "crossChannel": false,
    "ignoredVersions": [],
    "customSources": []
  }
}
```

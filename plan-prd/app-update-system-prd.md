# 应用更新系统 PRD

## 一、产品背景

### 1.1 现状
当前使用 GitHub Releases API 检测更新,存在问题:
- 部分用户无法访问 GitHub
- 仅提供跳转链接,无应用内下载
- 单一更新源,缺乏扩展性
- 错误处理不足
- 无国际化支持

### 1.2 核心目标
- 使用策略模式抽象更新源
- GitHub 不可访问时提供备选方案
- 通过下载中心提供应用内下载
- 全面支持 i18n

## 二、功能需求

### 2.1 多更新源架构

**策略模式抽象**:
```typescript
abstract class UpdateProvider {
  abstract readonly name: string
  abstract readonly type: UpdateProviderType
  
  abstract fetchLatestRelease(channel: AppPreviewChannel): Promise<Release>
  abstract getDownloadAssets(release: Release): DownloadAsset[]
  async healthCheck?(): Promise<boolean>
}

enum UpdateProviderType {
  GITHUB = 'github',
  OFFICIAL = 'official',  // 未来实现
  CUSTOM = 'custom'
}
```

**支持的更新源**:
1. **GitHub Provider** (默认)
   - 使用 GitHub Releases API
   - 健康检查: 5秒超时
   
2. **Official Provider** (预留)
   - 等待官方服务端实现
   
3. **Custom Provider** (高级选项)
   - 用户自定义 API 地址
   - 需兼容 GitHub API 格式

### 2.2 版本检测逻辑

**版本格式**:
- MASTER: `v1.0.0` 或 `1.0.0`
- SNAPSHOT: `v1.0.0-SNAPSHOT`

**版本比较规则**: 渠道 > 主版本 > 次版本 > 修订号

**渠道过滤**: 仅检测相同渠道更新(可配置跨渠道)

### 2.3 错误处理与降级

**错误类型**:
- 网络错误: "无法连接到更新服务器"
- 超时错误: "更新检查超时"
- API错误: "更新服务器暂时不可用"

**降级策略**:
1. GitHub 访问失败 → 显示友好错误提示
2. 提供备选方案(浏览器打开/稍后重试)
3. 记录错误日志供排查

### 2.4 用户界面

**更新弹窗**:
- 版本号对比(当前 → 新版本)
- 更新内容预览(Markdown渲染)
- 下载大小显示
- 更新源信息

**按钮组**:
- "稍后提醒" - 延迟到下次启动
- "忽略此版本" - 跳过当前版本
- "立即下载" - 通过下载中心下载
- "浏览器打开" - 跳转 Release 页面

**设置页面**:
```
更新源选择:
  ○ GitHub Releases (推荐)
  ○ 官方网站 (即将推出)
  ○ 自定义源

更新检查:
  ☑ 自动检查更新
  检查频率: [每次启动 ▼]
  ☐ 允许跨渠道更新提醒
```

### 2.5 国际化支持

**核心文案**:
```json
{
  "update": {
    "title": "发现新版本",
    "current_version": "当前版本",
    "new_version": "新版本",
    "later": "稍后提醒",
    "download": "立即下载",
    "network_error": "无法连接到更新服务器",
    "no_update": "当前已是最新版本"
  }
}
```

## 三、技术设计

### 3.1 文件结构

**核心文件**: `apps/core-app/src/renderer/src/modules/hooks/useUpdate.ts`

**新增文件**:
```
apps/core-app/src/renderer/src/modules/update/
├── UpdateProvider.ts
├── GithubUpdateProvider.ts
├── OfficialUpdateProvider.ts
├── CustomUpdateProvider.ts
└── UpdateProviderManager.ts
```

### 3.2 类型定义

```typescript
interface UpdateSourceConfig {
  type: UpdateProviderType
  name: string
  url?: string
  enabled: boolean
}

interface UpdateCheckResult {
  hasUpdate: boolean
  release?: Release
  error?: string
  source: string
}
```

### 3.3 主进程支持

**IPC 通道**:
- `app-update:check`
- `app-update:download`
- `app-update:download-progress`
- `app-update:download-complete`

### 3.4 配置管理

**配置文件**: `<root>/config/app-update-settings.json`

```json
{
  "update": {
    "enabled": true,
    "frequency": "startup",
    "source": {
      "type": "github",
      "url": "https://api.github.com/repos/talex-touch/tuff/releases"
    },
    "crossChannel": false,
    "ignoredVersions": []
  }
}
```

## 四、实施计划

### 阶段一: OOP架构重构 (2-3天)
- 创建 UpdateProvider 抽象基类
- 实现 GithubUpdateProvider
- 创建 UpdateProviderManager
- 重构现有 useUpdate 逻辑

### 阶段二: 错误处理与i18n (1-2天)
- 实现网络错误处理
- 添加所有 i18n 文案
- 完善错误提示 UI

### 阶段三: 设置页面集成 (2-3天)
- 添加更新设置模块
- 实现更新源切换
- 添加自定义源配置

### 阶段四: UI增强 (2-3天)
- 重构 AppUpgradationView.vue
- 添加版本对比
- 集成下载中心 API

**总工期**: 7-10 天

## 五、验收标准

- 支持 GitHub/官方/自定义 三种更新源
- 更新检测成功率 ≥ 95%
- 用户更新率 ≥ 60%
- 所有文案支持 i18n
- 错误提示清晰友好

## 六、安全考虑

- 文件 SHA256 校验
- 自定义源显示安全警告
- 强制 HTTPS 协议
- 记录自定义源使用日志

## 七、风险与缓解

1. **GitHub API限制** - 缓解: 指数退避重试
2. **自定义源安全** - 缓解: 强制HTTPS + 警告
3. **版本比较复杂** - 缓解: 充分测试各版本格式

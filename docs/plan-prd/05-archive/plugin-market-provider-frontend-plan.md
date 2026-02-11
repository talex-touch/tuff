# PRD: 插件市场 Provider Registry（前端版）

## 1. 背景

- 现有 Market 只消费 GitHub manifest，UI 虽列出多个来源但纯摆设，体验像扯淡的假货市场。
- 业务方确认：首版仅需前端完成 Provider Registry，不依赖主进程或服务端；后续再看是否下沉。
- 为避免类型散落，所有 Provider/Plugin DTO 统一沉淀在 `packages/utils`，供 renderer 与插件共享。
- 源配置只需轻量持久化，直接落在浏览器 `localStorage`，无需触发 StorageModule/IPC。

## 2. 目标与原则

1. **前端自洽**：所有 Provider 注册、实例化、数据抓取在 renderer 内完成，Vue 页面直接消费。
2. **轻量持久化**：使用 `localStorage['talex.market.sources']` 保存源配置，提供迁移/默认值逻辑。
3. **可扩展类型**：`packages/utils/market/` 增补 Provider/Plugin 类型、配置 Schema，确保后续模块可复用。
4. **KISS + YAGNI**：只覆盖列表展示、搜索过滤、源管理、安装所需 metadata，不提前实现后端联调能力。
5. **健壮容错**：单个 Provider 失败不拖垮市场页，UI 给出 per-provider 错误提示。

## 3. 用户场景

- **普通用户**：在 Market 页面浏览/搜索插件，选择来源（官方 Nexus、GitHub/Gitee 仓库、NPM 包等），单击安装。
- **进阶用户**：打开“Source”弹窗，新增自定义源（输入名称、类型、URL），调整启用顺序并保存。
- **开发者调试**：通过仓库/自建 Nexus 源接入本地 mock，验证插件 manifest，无需重启应用。

## 4. 功能范围

### 4.1 Provider 管理
- 内置 Provider 类型（三大类兼容多个 host）：
  1. `repository`：兼容 GitHub/Gitee/GitLab 等仓库，配置项包含 `platform`、`owner`、`repoPattern`、`releaseChannel`。
  2. `nexusStore`：Talex 官方或自建 Nexus API，配置 `baseUrl`、`token`、`namespace`。
  3. `npmPackage`：标准 NPM 或镜像仓库，配置 `registryUrl`、`scope/keyword`。
- 每个 Provider 记录 `id/name/type/url/enabled/priority/config`，支持拖拽排序、启用开关。
- localStorage 初始化：若无数据则写入内置默认 sources；若 schema 版本落后则自动迁移。

### 4.2 Provider Factory + Registry（前端）
- `useMarketProviders.ts`（renderer composable）维护 `Map<providerId, ProviderInstance>`。
- Factory 根据 `definition.type` 返回对应实现（直接写在 renderer `modules/market/providers/*`）。
- Registry 提供 API：`getDefinitions()`, `saveDefinitions()`, `getActiveProviders()`, `refreshInstances()`.

### 4.3 数据获取与聚合
- `MarketDataService` 调用 Registry，按顺序并发 `provider.list()`，对结果去重（`pluginId+providerId`）。
- 支持 searchKey：若 Provider 支持 `search` 则调用，否则本地过滤。
- 返回结构：`{plugins: MarketPlugin[], stats: ProviderResultMeta[]}`，供 UI 展示“5 来源 / 1 失败”。

### 4.4 安装协同
- Provider 返回 `installInstruction`（tarball URL / git repo / zip URL），交给 `useMarketInstall` 直接复用。
- 确保 Official Provider 兼容原逻辑（GitHub raw manifest +文件下载）。

### 4.5 源编辑器 UI
- Editor 读取 Registry definitions → 渲染列表（拖拽排序、enable switch、编辑按钮、删除）。
- “Add Source” 选择三种类型之一：
  - `repository`：展示 platform selector（GitHub/Gitee/GitLab）、owner/repo 模板、access token。
  - `nexusStore`：输入 base URL、clientId/token、namespace。
  - `npmPackage`：输入 registry URL、scope/keyword、版本策略。
- 保存时写回 localStorage 并触发 Registry refresh。

## 5. 数据结构与类型归属

| 路径 | 说明 |
| --- | --- |
| `packages/utils/market/types.ts` | `MarketProviderType`, `MarketProviderDefinition`, `MarketPlugin`, `MarketInstallInstruction` 等核心类型 |
| `packages/utils/market/constants.ts` | 默认 Source 列表、localStorage key、schema 版本 |
| `apps/core-app/src/renderer/src/modules/market/providers/*` | 各 Provider 具体实现 |
| `apps/core-app/src/renderer/src/composables/market/useMarketProviders.ts` | Registry/Factory + localStorage 读写 |

类型示例：
```ts
export interface MarketProviderDefinition {
  id: string
  name: string
  type: MarketProviderType
  enabled: boolean
  priority: number
  config: Record<string, any>
}

export interface MarketPlugin {
  id: string
  providerId: string
  name: string
  version: string
  description?: string
  icon?: string
  category?: string
  install: MarketInstallInstruction
  metadata?: Record<string, any>
  timestamp?: number | string
}
```

## 6. 本地存储 & 全局状态

- **状态容器**：通过 `TouchStorage + createStorageProxy` 绑定 `StorageList.MARKET_SOURCES`，由 StorageModule 负责持久化，示例：
  ```ts
  class MarketSourcesStorage extends TouchStorage<MarketSourcesPayload> {
    constructor() {
      super(StorageList.MARKET_SOURCES, createDefaultPayload())
      this.setAutoSave(true)
    }
  }
  export const marketSourcesStorage = createStorageProxy('storage:market-sources', () => new MarketSourcesStorage())
  ```
  这样 Source Editor、Market 列表、其他模块都共享同一份全局 reactive state，并且写入直接经过 StorageModule，自动广播更新。
- **主 key**：`StorageList.MARKET_SOURCES`（落地 `market-sources.json`）。
- **格式**：`{ version: 1, sources: MarketProviderDefinition[] }`，在 storage 层做 schema 校验、新版本迁移、默认源注入。
- **读流程**：渲染进程通过 `storage:get` 即时读取缓存，TouchStorage 初始化时自动 `sendSync`，无须手动 parse。
- **写流程**：任何对 `marketSourcesStorage.data` 的修改都会触发 debounced `storage:save`，并由 StorageModule 广播 `storage:update`，所有窗口同步。
- **缓存策略**：Provider 内部仍可维护 5 分钟内存缓存；若需跨组件共享可使用 `createGlobalState` 包装普通 Map，但持久化统一交给 StorageModule。

## 7. 前端架构设计

1. **Provider 实现**  
   - `RepositoryProvider`: 针对 GitHub/Gitee/GitLab，以 repo release 或 manifest 文件为数据源，config 中声明 `platform` 与 repo 定位方式。  
   - `NexusStoreProvider`: 复用现有官方 manifest 逻辑，面向 Talex 官网或其他 Nexus-store API。  
   - `NpmPackageProvider`: 调用 NPM registry/mirror 接口（`/-/v1/search`、`package`），基于 scope 或 keyword 拉取插件。

2. **Registry & Service**  
   - `MarketProviderRegistry` 存 definitions + 实例。  
   - `MarketDataService` 负责 `fetchPlugins({force, keyword})`，返回 `plugins` + `errors`.  
   - `useMarketData` 仅调用 DataService，前端其余逻辑保持。

3. **状态同步**  
   - 通过 Pinia store `useMarketSourceStore`（或现有 composable state）暴露源列表/加载态。  
   - Source Editor 修改 → store 更新 → Market 列表 reactive 刷新。

## 8. 核心交互流程

### 8.1 市场加载
1. Market 页面挂载 → `useMarketProviders.load()` → lokal definitions ready。  
2. 调 `MarketDataService.fetchPlugins()` → 并发 provider 请求。  
3. 更新 UI：列表 + 顶部来源数量 + 错误提示（某源失败）。  
4. 用户搜索：更新 searchKey，触发 `fetchPlugins({keyword})` 或本地过滤。

### 8.2 Source 编辑流程
1. 打开 Source Editor → 调 `useMarketProviders.listDefinitions()`.  
2. 拖拽/开关/新增/删除 → 暂存于本地状态。  
3. 点击保存 → `useMarketProviders.save(defs)` → localStorage & store 更新。  
4. 自动刷新 Market 列表（force=true）。

### 8.3 插件安装
1. 用户点击安装 → `MarketPlugin.install` 传给 `useMarketInstall`.  
2. 若为 tarball URL 则复用现有 download -> unzip -> register 流程；git/zip 先落地 TODO（后续扩展 hook）。  
3. 安装完成后更新 UI 状态（“已安装”）。

## 9. 实施步骤与里程碑

1. **类型与默认源**（0.5d）  
   - 在 `packages/utils/market/` 新增类型、默认配置、版本常量。  
   - 提供 helper `getDefaultMarketSources()`.

2. **Provider Registry & LocalStorage**（1d）  
   - 编写 `useMarketProviders` composable：加载、保存、订阅变更。  
   - 加入事件/Pinia store。

3. **Provider 实现（官方 + 自定义 HTTP）**（1d）  
   - 改造现有官方列表逻辑为 provider。  
   - 实现 CustomHttpProvider（直接 fetch endpoint）。  
   - `MarketDataService` 完成聚合。

4. **UI 集成**（1d）  
   - Market 页面切换到新 service。  
   - Source Editor 接入 definitions、排序、保存。  
   - 列表展示 per-provider 状态。

5. **扩展 Provider（NPM/GitHub/Gitee）**（1.5d）  
   - 各自实现最小 `list` 能力，配置项包含必要凭据/URL。  
   - 完善安装 instruction。

6. **验收 & 文档**（0.5d）  
   - 更新 README/内置帮助说明 Market 源配置。  
   - 补充使用指南截图。

## 10. 风险与待解决事项

- **跨域限制**：renderer 直连 GitHub/Gitee/GitLab/Nexus/NPM 时需确认 CORS；若命中限制，需切到 `fetch` + 代理。
- **localStorage 冲突**：清缓存或多实例导致配置丢失；考虑增加导入/导出功能（后续迭代）。
- **安装指令多样性**：当前安装器主要处理 zip/tarball；`repository` 类型可能返回 git clone，需要补齐下载实现。
- **安全性**：自建 `repository`/`nexusStore` 源可返回恶意链接，UI 需提醒用户自负风险。

---

## 11. 实现状态 (2025-12-13)

### ✅ 已完成

| 任务 | 状态 | 说明 |
|------|------|------|
| 类型与默认源 | ✅ | `packages/utils/plugin/providers/` |
| Provider Registry & Storage | ✅ | `useMarketProviders` composable |
| TpexApiProvider | ✅ | 官方市场 API |
| NexusStoreProvider | ✅ | Nexus 市场集成 |
| NPM Provider | ✅ | `npm-package-provider.ts` |
| Repository Provider | ✅ | GitHub/Gitee 支持 |
| UI 集成 | ✅ | Market 页面 + Source Editor |
| Clerk 登录联动 | ✅ | 浏览器登录回调 |

### 📁 相关文件

**主进程**:
- `apps/core-app/src/main/service/plugin-market.service.ts` - 统一搜索服务

**工具包**:
- `packages/utils/plugin/providers/market-client.ts` - PluginMarketClient
- `packages/utils/plugin/providers/tpex-provider.ts` - TPEX API
- `packages/utils/plugin/providers/npm-provider.ts` - NPM Registry

**渲染进程**:
- `apps/core-app/src/renderer/src/modules/market/providers/` - Provider 实现
- `apps/core-app/src/renderer/src/views/market/` - 市场页面

### 🟡 待完成

- [ ] 验收 & 文档 (0.5d) - 更新 README/内置帮助说明

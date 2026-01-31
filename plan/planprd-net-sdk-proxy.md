# PRD: Net SDK 统一代理 & PluginFeatures 动效抽离

## 背景
- Dev Server 健康检查与重连偶发“断联”主要由系统代理/本地代理影响导致。
- 当前网络请求分散在主进程/渲染进程/插件/核心功能中，proxy 行为不一致。
- PluginFeatures 弹窗动效内联在页面，复用与维护成本高。

## 目标
- 统一网络访问：主进程封装 `NetServerSDK`，渲染进程/CoreBox/客户端/插件统一用 `NetClientSDK`。
- 统一代理配置：应用级全局开关 + 全局代理地址，可选择启用/禁用。
- 允许调用方指定 proxy 行为：`off` / `followApp` / `custom`。
- `custom` 代理需权限 `260131`，未授权时明确拒绝并反馈原因。
- 保留可观测性：所有连接失败须输出可读原因（error code / status / url）。

## 非目标
- 不在本 PRD 内完成全部模块迁移（仅给出迁移清单与优先级）。
- 不改变现有业务协议或返回结构（除 SDK 新封装接口）。

## 现状与问题
- 多处 axios 请求显式 `proxy: false`，但 Dev Server 健康检查缺失该配置，导致代理影响。
- proxy 行为散落于各处，缺少统一策略与用户控制入口。
- PluginFeatures 动效逻辑耦合页面结构，难复用/难迭代。

## 方案设计

### 1) NetServerSDK（主进程）
统一封装网络访问（axios/fetch），提供：
- `request<T>(options)`
- `get<T>(url, options)`
- `post<T>(url, data, options)`
- 统一超时、重试、日志与错误结构。

**代理解析优先级**
1. `options.proxy`（调用方显式传入）
2. `options.proxyMode`（`followApp` / `off` / `custom`）
3. 全局应用 proxy 配置
4. 默认 `off`

**接口示例**
```ts
type NetProxyMode = 'off' | 'followApp' | 'custom'
type NetProxyConfig = { url: string; auth?: { username: string; password: string } }

interface NetRequestOptions {
  proxyMode?: NetProxyMode
  proxy?: NetProxyConfig | false
  timeout?: number
  headers?: Record<string, string>
}
```

### 2) NetClientSDK（渲染进程 / CoreBox / 插件 / 客户端）
统一从客户端侧调用主进程网络能力：
- Renderer/CoreBox/插件都通过 IPC 到 `NetServerSDK`。
- 插件侧传 `proxyMode/custom` 时做权限校验。
- 统一返回结构：`{ ok: boolean; data?: T; error?: string; meta?: object }`。

### 3) 代理配置与权限
**全局配置（Settings）**
- `network.proxy.enabled: boolean`
- `network.proxy.url: string`
- `network.proxy.mode: 'off' | 'on'`（可扩展）
- `network.proxy.bypass?: string[]`（可选，后续）

**权限规则**
- `proxyMode: 'custom'` 需要权限 `260131`。
- 未授权：直接拒绝并返回 `error: 'Proxy permission denied (260131)'`。

### 4) 迁移策略（分阶段）
**阶段 0（已在当前改动落地）**
- Dev Server 健康检查强制 `proxy: false`。

**阶段 1**
- 实现 `NetServerSDK` + `NetClientSDK` 骨架与 IPC 通道。
- 全局 proxy 配置在设置中可开关。

**阶段 2**
- 迁移核心请求：market、plugin loader、widget loader、official-plugin。
- 为插件提供 client SDK 接口。

**阶段 3**
- 插件自定义 proxy 与权限申请流程完善。

### 5) 观测与日志
- 统一打印 `net.proxy.mode`、`proxy.url`（脱敏）和失败原因。
- 失败日志须包含 `code/status/url` 关键字段。

## Network Proxy 细化方案（补充）

### 范围与边界
- 主进程唯一出网（NetServerSDK）；渲染进程/CoreBox/插件统一经 NetClientSDK IPC。
- 旧 axios wrapper 保留兼容期，不再新增新调用点。
- Dev Server 健康检查与重连强制 `proxy: false`，不受系统代理影响。

### 配置结构（AppSettings）
- `network.proxy.enabled: boolean`
- `network.proxy.mode: 'off' | 'on' | 'system'`（`system` = follow env proxy）
- `network.proxy.url: string`
- `network.proxy.bypass?: string[]`（默认包含 `localhost`, `127.0.0.1`, `::1`）
- `network.proxy.auth?: { username: string; password: string }`（仅请求期使用，不持久化；如需持久化走系统 Keychain）

### 代理解析与优先级
1. `options.proxy === false` → 强制直连
2. `options.proxy` 为对象 → 走 `custom`（需权限）
3. `options.proxyMode` → `off` / `followApp` / `custom`
4. 全局设置（`enabled` + `url` / `system`）
5. 默认 `off`

- `followApp`：使用应用全局代理配置
- `custom`：需权限 `260131`，失败返回 `Proxy permission denied (260131)`

### Agent 构建策略（Node）
- http/https 代理：`http-proxy-agent` / `https-proxy-agent`
- socks5 代理：`socks-proxy-agent`
- system/env：`proxy-from-env` + `NO_PROXY` / `no_proxy`
- axios 默认 `proxy: false`，统一通过 `httpAgent` / `httpsAgent` 注入

### UI/交互（Settings）
- 开关 + 模式选择（手动 / 系统）
- 代理地址输入 + 校验（协议必填）
- Bypass 维护（多条 host/domain）
- “测试代理”按钮：调用 NetServerSDK 测试接口，回显延迟与失败原因（脱敏）

### 日志与可观测性
- 统一字段：`net.proxy.mode`、`proxy.source`、`proxy.url(masked)`、`bypass.hit`、`status/code`、`error`
- 失败日志须包含 `code/status/url`，避免泄露凭据

### 迁移清单（优先级）
- 高：market、official-plugin、plugin loader、widget loader
- 中：其他主进程 axios 请求
- 低：渲染进程旧 axios wrapper（仅保留兼容）

### 测试矩阵（最小集合）
- `off`：系统代理开启时仍直连
- `followApp`：全局启用/关闭切换生效
- `custom`：有权限 / 无权限
- `system`：环境变量生效 + `NO_PROXY` 命中
- `bypass`：本地地址不走代理

## PluginFeatures 动效抽离（计划）

### 目标
- 抽离 GSAP FLIP 动效为可复用 hooks + 组件，降低页面耦合。
- 为后续弹窗/卡片复用动效提供基础能力。

### 规划
**Hook**
- `useFeatureDetailFlip(options)`
  - 输入：`cardRef`, `sourceRect`, `sourceRadius`
  - 输出：`open`, `close`, `isExpanded`, `isAnimating`, `setTilt`

**组件**
- `FeatureDetailMask`：遮罩与点击关闭行为
- `FeatureDetailCard`：header/body 基础结构 + 动效 slot

### 现有逻辑摘录（作为迁移基线）
```ts
const FLIP_DURATION = 480
const FLIP_ROTATE_X = 6
const FLIP_ROTATE_Y = 8
const FLIP_SPEED_BOOST = 1.12
const showDetail = ref(false)
const isDetailExpanded = ref(false)
const isDetailAnimating = ref(false)
const detailCardRef = ref<HTMLElement | null>(null)
const sourceRect = ref<DOMRect | null>(null)
const sourceRadius = ref<string | null>(null)
const detailTilt = ref({ x: 0, y: 0 })
```

## 风险与缓解
- **代理误用**：默认 `off`，显式开启才生效，且日志可追踪。
- **权限滥用**：`custom` 强制权限校验与错误提示。
- **迁移成本高**：分阶段迁移，保留旧调用路径直到稳定。

## 验收标准
- Dev Server 健康检查与重连不受系统代理影响（proxy false）。
- 应用可在设置中启用/禁用全局代理。
- 自定义 proxy 无权限时有明确报错提示。
- PluginFeatures 弹窗动效可通过 hook/组件复用，视觉效果一致。

## 里程碑
- M1：NetServerSDK/NetClientSDK 基建 + 全局 proxy 配置
- M2：核心网络请求迁移完成
- M3：插件自定义 proxy 权限与 UI 完成
- M4：PluginFeatures 动效抽离与复用落地

# 三插件本地市场端到端打通

## Goal

让 `clipboard-history`、`touch-translation`、`json-formatter` 三个插件在**本地 Nexus（`http://localhost:3200`）**上完成
「发布 → 上架 → 市场搜得到 → 安装 → 功能跑通」的完整链路，并修复过程中暴露的插件与链路缺陷。

## Background

2026-08-14 排查发现：核心应用插件市场对任何关键词都返回「未找到插件」。原因不在客户端搜索，而在目录本身为空——
5 个源里只有 `tuff-nexus` 默认启用，它对 `/api/store/plugins?compact=1` 返回 `HTTP 200 {"plugins":[],"total":0}`
（生产 `https://tuff.tagzxia.com` 与本地 `http://localhost:3200` 均如此）。

服务端 `forStore` 路径要求插件 `status === 'approved'`，且至少一个版本同时满足：版本已审核、通道 `RELEASE`、
产物可用、policy passed、扫描通过、发布者签名已验证、Nexus attestation 已验证、admission 为 `eligible`
（`apps/nexus/server/utils/pluginsStore.ts` → `getPluginVersionEligibility`）。任一项不满足该版本不可见；
无可见版本时整个插件从列表消失，而不是降级展示。这套硬门槛来自 2026-07-19 的 `enforce signed audited releases` 系列提交。

因此本任务既是「三个插件能用」，也是「上架链路本身在本地可复现地跑通」。

## Scope

三个插件 + 支撑它们上架的本地链路。**不含**生产环境数据修复，**不含**把插件真的发布到 `tuff.tagzxia.com`。

### 插件来源

| 插件 | 来源 | 现状 |
|---|---|---|
| `clipboard-history` | 仓库内 `plugins/clipboard-history` | v1.1.10，sdkapi 260615，有 permissions / searchProviders |
| `touch-translation` | 仓库内 `plugins/touch-translation` | v1.0.11，sdkapi 260615，有 permissions / searchProviders |
| `json-formatter` | **仓库内没有**，需从 `github.com/talex-touch/json-formatter` 引入 | v1.0.5，sdkapi 260615，**无 permissions 声明**，最后更新 2026-06-19 |

## Requirements

1. 本地 Nexus 具备可复现的上架路径：CLI 登录 → 发布 → 审核 → 版本对匿名 `public` audience 可见。
2. `json-formatter` 进入本仓库 `plugins/`，并补齐当前 SDK 与 `plugins/AGENTS.md` 要求的约定
   （权限声明 + reason、npm 包名规则、去掉指向本机绝对路径的构建脚本）。
3. 三个插件各自可在核心应用中被搜索到、安装成功、主功能可用。
4. 链路中任何 fail-closed 的门槛，若在本地无法满足，必须给出明确的本地绕行方式或修复，
   而不是把门槛关掉了事——生产语义不能被本地方便性削弱。
5. 三个插件的代码适配到当前 SDK：`CURRENT_SDK_VERSION = 260713`，三者当前都是 `260615`。
   `260615` 仍在 `SUPPORTED_SDK_VERSIONS` 内，所以不是被运行时拦下，而是落后两档
   （`260626` SemanticAliasSDK、`260713` 插件 i18n / Domain Lexicon facade）。
   适配含义是：把 `sdkapi` 提到 `260713`，并逐个确认新增能力是否需要采用、既有调用面是否已废弃——
   只改 manifest 数字而运行时行为没验证，不算适配完成。
6. 修复限定在三个插件与上架链路本身；发现的旁路问题记录并汇报，不扩大改动。

## Acceptance Criteria

- [ ] 本地 Nexus `/api/store/plugins?compact=1` 返回三个插件，`total === 3`。
- [ ] 核心应用市场页搜索三个插件的名称与关键词，各自能命中。
- [ ] 三个插件在核心应用内安装成功，安装后出现在「已安装」列表且可启用。
- [ ] `clipboard-history`：能记录并回写剪贴板历史，权限门（`clipboard.read` / `clipboard.write`）按声明生效。
- [ ] `touch-translation`：配置一个翻译源后能完成一次文本翻译，密钥走 secret 通道不落普通 storage。
- [ ] `json-formatter`：能格式化一段 JSON，非法 JSON 有明确错误反馈。
- [ ] 三个插件的 `manifest.sdkapi` 均为 `260713`，且在该版本下加载、权限门、主功能实测通过。
- [ ] 上架链路步骤写进 `design.md`，可被第二个人照着复现，不依赖本会话上下文。
- [ ] 四个子任务各自的验收标准独立成立，不靠其他子任务的产物证明自己通过。

## Constraints

- 核心应用默认只启用 `tuff-nexus` 源；本地验证需把运行时服务器切到 local（`appSetting.dev.runtimeServer`）
  或设置 `TUFF_NEXUS_BASE_URL`，不得靠改默认源清单来绕过。
- 插件权限模型 fail-closed：permission SDK 缺失或异常时不得继续执行 clipboard / network / fs 操作。
- provider secret、API key 必须走 plugin secret capability，不得写进普通 plugin storage。
- 不为了让市场有数据而放宽 `getPluginVersionEligibility` 的判定条件。

## Non-Goals

- 修复生产环境 `tuff.tagzxia.com` 的空目录。
- 把三个插件发布到生产。
- 其余 21 个插件的上架与验证。
- 重构 store 客户端的搜索、分类或详情 UI。

## Open Questions

- 本地 Nexus 是否已有 `role === 'admin'` 账号？审核动作（`status.patch`、`versions/[versionId].patch`）强制要求管理员。
- 发布时 `securityScanDecision` / `admissionStatus` / `nexusAttestation` / `publisherVerifiedAt` 在本地是否会被自动置为可上架值；
  若否，本地补齐方式是什么。

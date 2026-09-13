# PRD: Tuff 云端下发语音 Provider（Voice Provider Pack）

> 更新时间：2026-09-13
> 状态：**v1 / 代码与本地验证完成**（P1-P5 + D3 envelope 均有 focused evidence；Production 签名/存储配置与付费真实 Provider 验收未执行）
> 任务记录：[`.trellis/tasks/09-13-voice-provider-cloud-pack/prd.md`](../../../.trellis/tasks/09-13-voice-provider-cloud-pack/prd.md)（关联 design.md / implement.md）
> 目标版本：待定（建议 2.6.x 或独立 R8-G）
> 质量口径：遵循 [`../PRD-QUALITY-BASELINE.md`](../PRD-QUALITY-BASELINE.md)

## 0. 一句话

把「客户端如何对接 Nexus 语音」从**代码里的硬编码协议分支**，变成**云端签名下发、登录后自动同步、本机校验后动态生效的语音 Provider 描述包**；包只描述路由，不携带上游密钥，也不执行远端代码。

---

## 1. 最终目标

**业务目标**：Nexus 语音通道的能力边界、模型清单、限流与灰度策略可以**不改客户端版本**地调整；新用户登录后第一次语音输入即使用云端当前生效的语音路由；协议细节（端点、字段、分帧）不以明文出现在客户端产物里。

**工程目标（可验证）**：

1. CoreApp 存在一条**签名可验证**的云端语音 Provider 下发链路：`manifest → 内容寻址 payload → 验签 → 严格归一化 → SQLite → 显式激活`，任何一步失败都保持上一个 active 不变。
2. `voice-provider-runtime` 的协议解析从「穷举 switch 3 个硬编码协议」演进为「受控协议枚举 + 描述包参数」，且**不引入 `eval`/`new Function`/远端脚本解释器**。
3. 登录触发的自动同步可观测：包身份、版本、hash、签名状态、激活时间、上次失败原因都能从诊断面读到。
4. 端到端链路在**本地 Nexus（Pages + 本地 D1/R2）**上跑通：登录 → 同步 → 验签 → 解密 → 导入 → 激活 → 真实语音转写 → 回滚。

---

## 2. 现状基线（已验证事实）

> 本节只写可复核的现状，作为后续决策的依据。带路径的均为本次实测/读码确认。

### 2.1 语音运行时（客户端）

| 事实 | 证据 |
| --- | --- |
| 路由 owner 是主进程 | `apps/core-app/src/main/modules/voice/voice-module.ts`（typed transport + 权限 `voice.dictation`）、`voice-service.ts`（会话编排、捕获前冻结 adapter） |
| Provider 选择是**配置数据驱动**，但**协议实现是硬编码穷举** | `voice-provider-runtime.ts:165-203` 的 `switch (metadata.protocol)`，只有 `bailian-paraformer` / `dashscope-qwen-asr-realtime` / `doubao` 三支 |
| 协议枚举与 DTO 校验是封闭集 | `packages/utils/intelligence/voice-asr.ts:22-64`（`VoiceAsrProtocol`，doubao 还需 `resourceId`） |
| adapter 真实实现只在包内 | `packages/tuff-voice/src/providers/{bailian-paraformer,dashscope-qwen-asr-realtime,doubao}.ts`；`packages/tuff-voice/src/contracts.ts:163-183` 的 registry 支持 `register/get/list/resolve`，**但 CoreApp 解析入口不走 registry** |
| 凭据只从 main secure-store 取 | `provider-credential-runtime.ts:45-172`；Nexus 走 auth session token；`apiKey` 仅 transient，持久 DTO 脱敏 |
| 上传边界：只接受 main-owned 解析出的受控 HTTPS URL | `packages/tuff-voice/src/upload-source.ts`、`voice-service.ts:850-890` |

**结论**：今天加一个新语音协议 = 改 `voice-asr.ts` + `voice-provider-runtime.ts` + `packages/tuff-voice` + 测试 + 发版。

### 2.2 Nexus 语音服务端（已有）

| 事实 | 证据 |
| --- | --- |
| 转写入口 | `apps/nexus/server/api/v1/ai/audio/transcribe.post.ts`：app auth（`requireAppAuth`）→ raw body 音频 + `content-type` + `x-idempotency-key` → 202 `dispatching` 或 200 结果 |
| 轮询入口 | `GET /api/v1/ai/audio/transcriptions/:requestId` |
| 计费生命周期 | `asrTranscriptionService.ts` / `asrTranscriptionStore.ts` / `dashscopeAsrProvider.ts`（reserve → settle → release） |
| 客户端内置通道 | provider id `tuff-nexus-default`（`packages/utils/intelligence/nexus-provider.ts`）、model `nexus-audio-transcribe`（`packages/utils/types/intelligence.ts:1172`） |
| **客户端 Nexus 语音客户端是手写的**（这正是本 PRD 想参数化的对象） | `apps/core-app/src/main/modules/nexus/asr-client.ts`（353 行）：硬编码 `/api/v1/ai/audio/transcribe`（:297）与轮询 `…/transcriptions/:requestId`（:317）；本地校验 WAV/`MAX_AUDIO_BYTES` 20 MiB/`MAX_AUDIO_SECONDS` 600 s/`MAX_TRANSCRIPT_LENGTH` 1e6；`POLL_INTERVAL_MS` 500、`MAX_POLL_DEADLINE_MS` 10 min；`SUPPORTED_STATES` 闭集 + `mapHttpError` + `readBilling`（`IntelligenceSTTBilling`）；由 `ai/providers/nexus-provider.ts:557` 调用 |
| 注意 | Nexus 语音当前走通用 `audio.stt`（文件转写）路径，**不在** `metadata.voiceAsr` 的三协议实时路径里 |

### 2.3 云端下发设施（已有的两块，缺第三块）

| 通道 | 现状 | 证据 |
| --- | --- | --- |
| **Catalog（签名整包）** | 客户端完整：`NexusCatalogRemote` → `PinnedCatalogVerifier`（固定 RSA 根，RSA-SHA256 + payload SHA-256）→ SQLite → activate/rollback。**仅 `domain-lexicon` 一种类型；远程路径无调用方；非登录自动** | `apps/core-app/src/main/modules/catalog/*`、`packages/utils/i18n/catalog.ts:71`、`docs/engineering/catalog-service-boundary.md` |
| Catalog 服务端 | **不存在**。全仓只有客户端与测试引用 `/api/v1/catalogs/*`，`apps/nexus/server/api` 下无该路由 | `grep -rn "api/v1/catalogs"`（仅命中 `catalog-remote.ts` 与测试、`.trellis/tasks/09-03-*/design.md`） |
| **Sync（登录即通）** | `apps/core-app/src/main/modules/sync/index.ts`：`subscribeAuthState` → 登录即 `runStartupSync` → 增量 oplog `pull/push`（`/api/v1/sync/*`）+ 10 分钟轮询；载荷 `enc:v1`（AES-256-GCM，本机 key 经 `/api/v1/keys/register` 注册） | `sync/index.ts:1785,1806,1847`、`sync-payload-crypto.ts:10,130`、`packages/utils/cloud-sync/cloud-sync-sdk.ts` |
| **Plugin Store（.tpex）** | 客户端 + 服务端都完整：artifact SHA-256 重算与 quarantine、Ed25519 publisher envelope、内置 trust root、安装落盘、host capability registry | `apps/nexus/server/api/store/plugins/[slug]/download.get.ts`、`plugin/providers/tpex-provider.ts`、`plugin/signature-verifier.ts`、`plugin/host/*` |

### 2.4 动态执行现状

| 事实 | 证据 |
| --- | --- |
| **不存在**「云端下发脚本 → 客户端动态执行」链路 | `config/script-bridge.json` 全仓不存在；`apps/core-app/docs/script-native-bridge.md` 只是设计 |
| 已存在的动态执行仅限**已安装插件 / widget** | `widget-registry.ts:1559-1638`（`new Function`，测试自陈「Shares JavaScript intrinsics with host renderer; Not a process, origin, or realm isolation boundary」）、`plugin-host-child-runtime.ts:3355-3380`（Node `vm`，`codeGeneration:{strings:false,wasm:false}` + capability 白名单） |
| 质量基线已明文约束动态执行 | [`../PRD-QUALITY-BASELINE.md`](../PRD-QUALITY-BASELINE.md) §4.4：动态执行必须有输入约束、sandbox/facade、审计或替换计划；`new Function` 只允许出现在已声明的运行时边界内 |

### 2.5 最接近的先例

`.trellis/tasks/09-03-remote-app-alias-catalog/`（status: planning，parent `07-13-catalog-service-mvp`）已经决定：**在 CatalogService 家族里加第二种签名整包类型**，并给出 Nexus 侧路由 `/api/v1/catalogs/:type/latest` 与 `/:type/:packId/:version/:sha256.json`，同时明确 **"No startup fetch, background polling, or renderer-side parsing is introduced"**。

> 本 PRD 与 09-03 的关系：同一家族、同一套验签与激活语义，**但触发策略与本 PRD 第 12 节的决策点冲突**，需要显式裁决（见 D4）。

### 2.6 在飞的并发工作（实施时必须避让）

本次落库时工作树上有**未提交**的 Nexus 语音接入实现，和本系统直接相邻，实施顺序必须尊重它：

| 在飞内容 | 文件 |
| --- | --- |
| Nexus 缓冲式 STT provider（新） | `apps/core-app/src/main/modules/voice/buffered-stt-provider.ts`（+ 同名 test，均未跟踪） |
| 语音运行时新增 `buffered` 模式与 Nexus 回退分支 | `apps/core-app/src/main/modules/voice/voice-provider-runtime.ts`（已修改：`resolveNexusBufferedSttProvider`、`mode: 'realtime' \| 'buffered'`） |
| Nexus 转写服务/存储/DashScope provider 与其测试 | `apps/nexus/server/utils/asrTranscription{Service,Store}.ts`、`dashscopeAsrProvider.ts`（已修改，含新增测试） |
| voice typed transport 域 | `packages/utils/transport/sdk/domains/voice.ts`（已修改） |
| 计费任务记录 | `.trellis/tasks/09-08-nexus-ai-channel-billing/{prd,design,implement}.md`（已修改） |

**结论**：本系统的 **P1 / P2 落点全部不在脏区**（catalog 契约、CoreApp catalog 模块、Nexus catalog 路由），可以独立开工；**P3 会改 `voice-provider-runtime.ts`，必须等上面这批工作提交或明确协调后再动**。这条约束已写入任务 [`implement.md`](../../../.trellis/tasks/09-13-voice-provider-cloud-pack/implement.md)。

---

## 3. 核心设计决策

### D-A：包是**声明式描述符**，不是可执行脚本（推荐）

- **推荐**：下发的是一份严格 schema 的 JSON（协议枚举 + 端点 + 字段映射 + 分帧 + 限额 + 模型表），客户端用**已有/新增的通用 adapter**按描述符装配；新增协议仍需客户端发版，但**路由参数、模型、限流、灰度、端点迁移**不需要。
- **理由**：仓库里今天没有可用的远端脚本沙箱；把麦克风权限 + 文本注入 + 凭据相邻的主进程做成「下载什么就执行什么」，与 §4.4 直接冲突。声明式描述符能覆盖用户列出的「如何对接 Nexus 语音」的全部内容。
- **被否决的替代**：直接下发 JS 交给 `new Function`（widget 那套明确不是安全边界）；或下发 Node `vm` 脚本（那是插件隔离协议，不是不可信云脚本沙箱）。
- **预留**：若声明式确实不够，Phase 3 再开「受限解释器 / 独立低权限 helper」独立任务，范围与门禁另立。

### D-B：交付通道用 **Catalog 家族**，不用 Sync（推荐）

- **推荐**：新增 `voice-provider` 作为 CatalogService 的第三种签名整包类型；Nexus 新增只读路由提供 manifest 与内容寻址 payload。
- **理由**：Catalog 链路已经具备**固定 RSA 信任根 + payload hash + SQLite 事务 + activate/rollback + 失败不污染**这些「服务端可下发可信内容」的必要性质；Sync 通道是**用户数据**通道（无签名语义、走用户配额、语义可被客户端改写），拿它下发可执行/可信配置是语义越界。
- **Sync 的正当用途**：只承载**非权威**的每用户选择（用户选了哪个包/哪条路由），不承载可信内容本身。

### D-C：「加密」的真实语义要写清楚

- **签名（真实性/完整性）是硬要求**：manifest 由固定 RSA 根签名，payload 用 SHA-256 + `timingSafeEqual` 校验（复用 `catalog-verifier.ts`）。签名必须覆盖 `packId/version/schemaVersion/payloadSha256/minSdkApi/expiry`。
- **已选实现（登录态包密钥）**：每个发布包使用独立 32-byte DEK + 随机 12-byte nonce 生成 AES-256-GCM envelope；manifest 签名绑定**密文**长度/hash 与 `{ algorithm, keyId }`，R2 只保存密文。
- **密钥分发**：`VOICE_PROVIDER_CATALOG_KEYS` 是 secret JSON map，key 为 `voice-provider/<packId>/<version>/<keyId>`；登录后由 app-authenticated、`private, no-store` 的 Nexus route 返回匹配 DEK。CoreApp 只在 main 内存持有，完成验签/解密后把调用方与 verifier 的 key buffer 都清零。
- **AAD**：绑定 `type/packId/version/schemaVersion/createdAt/keyId`；错 key、错 tag、错身份或密文篡改均 fail-closed，不进入 strict normalizer / SQLite。
- **必须承认的边界**：该设计保护匿名抓取与 R2 静态窥探，并支持按包轮换/撤销；已登录客户端能拿到 DEK，用户/攻击者也能提取。包内不得放任何「不想让人看到就成立」的秘密；上游 Provider API key 一律不进包。
- **明确禁止**：固定对称密钥嵌入客户端；那只是可逆混淆，不是本节声称的机密性。

### D-D：凭据与计费边界不变

- 包只描述**如何调用 Nexus 语音**；Nexus 侧继续由 `asrTranscriptionService` 做 reserve/settle/release（见 `09-08-nexus-ai-channel-billing`）。
- 客户端使用 **Nexus 会话 token**（现有 auth session）调用，不把 token 写进包、URL、日志或 provider metadata。
- 非 Nexus 的第三方 Provider 若也纳入包描述，凭据仍走 `authRef` → secure-store vault，包内只出现 `authRef` 标识。

### D-E：可复用的是交付平面，不是“万能脚本”

- 后续云控能力复用 `CatalogManifestV1`、固定发布签名、内容寻址、可选 A256GCM envelope/key identity、登录态获取、SQLite 生命周期和安全诊断。
- 每个新增 `CatalogPackType` 仍必须随客户端发布独立 typed schema/normalizer、持久化投影和 runtime adapter；共享层不解释任意字段，更不执行下载代码。
- 远程 check/download/key/activate 只有在账户登录完成后可用，未登录返回 `CATALOG_AUTH_REQUIRED` 且零网络请求；本地 status/rollback 保留用于诊断恢复。
- 云控包不得改变本机 opt-in。语音输入 fresh default 为关闭，必须由用户在带明显状态标识的 Settings 开关中手动开启；登录或激活路由包都不能代替该动作。新增实质性云控类别/用途前同步更新用户协议或单独告知。

---

## 4. 范围与非目标

### Phase 1 范围（本 PRD 主体）

- 新增 Catalog 类型 `voice-provider`（客户端类型扩展 + 服务端只读路由 + 归一化 schema + SQLite 表 + activate/rollback）。
- **触发面**：登录完成后自动检查一次 + 登录后的设置页手动「检查更新/同步」+ 诊断状态展示；未登录零远程调用，不做后台高频轮询。
- `voice-provider-runtime` 新增一种解析来源：`metadata.voiceAsr.protocol === 'nexus-pack'` → 从 active pack 读取描述符 → 校验 `minSdkApi` / 协议 / 模型 / 限额 → 用 `packages/tuff-voice` 的通用 adapter 装配。
- 端到端测试链路（本地 Nexus）+ 负向门禁（伪造签名、摘要篡改、过期、回滚、断网、降级版本、未登录）。
- 内置 `tuff-nexus-default` buffered route 是无 active pack 时的代码内回退；它不是远端 pack，且同样需要 Nexus 登录才能实际请求。

### 非目标

- 不下发/执行任意远端 JavaScript、Python 或 shell。
- 不把现有 3 个硬编码协议一次性迁移到包（可作为 Phase 2 的独立任务，收益大但风险面也大）。
- 不做 TTS、不做实时流式协议（本 PRD 只覆盖现有 `audio.stt` 文件转写 + 路由描述；实时协议作为 Phase 2 选项）。
- 不做 Settings 内的第三方 Provider 凭据托管；不改变现有权限模型。
- 不做服务端写接口 / 运营后台（Publish 走 release 流程，与 09-03 的 "authoring deferred" 保持一致）。

---

## 5. 目标架构与数据流

```text
Nexus（Cloudflare Pages + D1/R2）
  ├── 构建期签名：voice-provider pack（JSON）→ manifest(RSA-SHA256) + 内容寻址 payload
  └── 只读路由：GET /api/v1/catalogs/voice-provider/latest
                GET /api/v1/catalogs/voice-provider/:packId/:version/:sha256.json
        │
        ▼  （登录后一次 + 手动 + 设置页）
CoreApp main：CatalogService(voice-provider)
  NetworkService → PinnedCatalogVerifier（固定 RSA 根，验签名与密文摘要）
    → 登录态鉴权获取每包 DEK → A256GCM 身份 AAD 解密 → 严格归一化（未知键拒绝、边界、枚举白名单）
    → SQLite 事务（catalog_packs + voice_provider_entries）
    → 显式 activate（先落库再换 registry）
        │
        ▼
active voice-provider registry（内存 facade，只读）
        │
        ▼
VoiceService.streamDictation / transcribeUpload
  → voice-provider-runtime：Intelligence binding → protocol switch
      ├── 'nexus-pack' → 描述符查表 → minSdkApi/协议/模型校验 → tuff-voice 通用 adapter
      └── 其余三协议（不变）
        │
        ▼
Nexus POST /api/v1/ai/audio/transcribe（会话 token，raw body + content-type + x-idempotency-key）
  → GET /api/v1/ai/audio/transcriptions/:requestId → 归一化 transcript
```

关键不变量：

1. **Nexus 永不提供验签密钥**；信任根只来自打包产物 `apps/core-app/resources/keys/release-signing-public.pem`。
2. **先持久化再换 registry**（沿用 `catalog-service` 既有性质）。
3. 任何下载、验签、schema、解密或 SQLite 失败都保持上一个 active pack；没有 active pack 时才使用内置 Nexus buffered route，错误对用户可见。
4. 包解析结果**不落 renderer**：renderer 只看到 `status`。

---

## 6. 接口方向

### 6.1 `VoiceProviderPackV1`（草案）

```ts
interface VoiceProviderPackV1 {
  schemaVersion: 1
  packId: string                 // e.g. "official.voice-provider"
  version: number                // 单调递增
  minSdkApi: string              // 早于此值 = unsupported，fail-closed
  expiry?: string                // ISO8601；过期后拒绝激活
  providers: Array<{
    id: string                   // 稳定 id，客户端 registry key
    displayName: LocalizedText   // 走 Domain Lexicon / message catalog
    protocol: VoiceAsrProtocol   // 封闭枚举，不得为任意字符串
    transport: 'http-upload' | 'http-realtime' | 'ws-realtime'
    endpoint: {
      baseUrl: string            // 只允许 https，禁止 userinfo/query/hash
      submitPath: string
      pollPath?: string          // 含 :requestId 占位
    }
    auth: { mode: 'nexus-session' | 'secure-store-ref'; ref?: string }
    request: {
      body: 'raw-bytes' | 'multipart'
      contentTypePolicy: 'audio/*'
      headers?: Record<string, string>   // 白名单键，禁止 Authorization/Cookie
      idempotencyHeader?: string
    }
    models: Array<{ id: string; label?: string; languages?: string[] }>
    limits: { maxBytes: number; maxDurationSec: number; timeoutMs: number }
  }>
}
```

归一化器必须：拒绝未知键、限制字符串长度与数组条数、校验 URL（`https` + 无 userinfo/query/hash）、协议必须命中枚举、`minSdkApi` 必须 ≤ 本机 sdkapi、`providers.id` 去重。

### 6.2 CatalogService 扩展

`CatalogPackType` 从字面量 `"domain-lexicon"` 扩为联合（与 09-03 的 `app-semantic-alias` 合并考虑），并把 `VerifiedDomainLexiconPack` / `getActiveRegistry()` 这类**类型专用签名**抽成按 pack 类型分派的形式，避免第二个类型被塞进 lexicon 造型（09-03 design 已明确记录「shared generic JSON blob would discard type safety」）。

### 6.3 触发面

| 触发 | 行为 |
| --- | --- |
| 登录成功（`subscribeAuthState`） | 一次 `checkUpdates('voice-provider')`；失败静默降级 + 记录原因，不阻塞登录 |
| 设置页「检查更新」 | 显式 `check → download → import → activate`，展示版本/hash/签名/回滚入口 |
| 启动 | **不拉取**（与 09-03 决策一致，避免 §4.6 启动 critical path 违规） |
| 回滚 | `rollback('voice-provider', reason)` → 回内置包 |

### 6.4 「语音脚本」到底替换了什么（对着 `asr-client.ts` 说清楚）

| 今天写死在客户端 | Phase 1 是否进包 | 说明 |
| --- | --- | --- |
| 端点 `/api/v1/ai/audio/transcribe`、轮询路径 | ✅ 进包（`endpoint.submitPath` / `pollPath`） | 端点迁移无需发版 |
| `MAX_AUDIO_BYTES` / `MAX_AUDIO_SECONDS` / `POLL_INTERVAL_MS` / `MAX_POLL_DEADLINE_MS` / `MAX_TRANSCRIPT_LENGTH` | ✅ 进包（`limits`），但**客户端取 min(包值, 本地硬上限)** | 远端不得放宽本地安全上限 |
| 鉴权方式（Nexus 会话 token） | ✅ 进包（`auth.mode`），token 本身**永不进包** | 见 §3 D-D |
| `headers`（含 `x-idempotency-key`） | ✅ 白名单进包 | 禁止 `Authorization` / `Cookie` 由包指定 |
| 模型清单 / 展示名 / 语言 | ✅ 进包 | 模型可云端调整 |
| `SUPPORTED_STATES` 状态机、`mapHttpError`、`readBilling` 字段映射 | ❌ 不进包（Phase 1） | 状态机与计费字段属于**代码契约**，放包等于远端定义协议语义；如需下放，走 Phase 3 讨论 |
| WAV 头解析、base64 解码 | ❌ 不进包 | 纯本地实现 |

> 这张表是本 PRD 与「下发一段 JS 全权执行」的分界线：**参数可下发，语义不发下**。

### 6.5 Nexus 服务端

- `GET /api/v1/catalogs/voice-provider/latest`：返回 manifest 字节，服务端**不解析、不签名、不变更**（服务端只做静态投影 + 缓存头）。
- `GET /api/v1/catalogs/voice-provider/:packId/:version/:sha256.json`：内容寻址，命中静态 artifact 投影才返回，未命中 404。
- `GET /api/v1/catalogs/voice-provider/:packId/:version/keys/:keyId`：仅 app auth；从 `VOICE_PROVIDER_CATALOG_KEYS` 读取 32-byte base64 DEK，响应 `private, no-store` / `Pragma: no-cache` / `nosniff`，缺失 404、配置损坏 503，错误不回显 secret。
- 包**不经过 D1 业务表**；存放于 R2 / 构建产物（与 09-03 的取舍一致）。

---

## 7. 质量与安全约束

| 约束 | 落地要求 |
| --- | --- |
| 类型与跨层 | 新增通道必须走 typed transport / domain SDK；禁止新 raw event、禁止 renderer 解析包 |
| 密码学 | manifest 复用固定 RSA 根，签名绑定密文 hash + encryption metadata；payload 使用每包 AES-256-GCM DEK 与身份 AAD；key 只经登录态 no-store route 进入 main 内存并及时清零；禁止固定客户端 key / `safeStorage` |
| 秘密 | 包内禁止出现 API key / token / refresh token；凭据只能 `authRef` 或 Nexus 会话；日志只记 packId/version/hash/状态码 |
| 动态执行 | Phase 1 **零新增动态执行**；`endpoint`/`headers` 走白名单与 URL 校验；Phase 3 若开解释器，必须独立 PRD + sandbox + 预算 |
| 存储 | SQLite 为 SoT；远端 JSON 只作为**导入输入**；activate/rollback 一律从 SQLite 重建 |
| 启动性能 | 登录后检查必须 `void` 异步、不进入首屏关键路径（§4.6） |
| 失败语义 | `unsupported`（minSdkApi 不满足）/ `expired` / `signature-invalid` / `schema-invalid` / `not-configured` 五类，全部用户可见且可恢复 |
| 依赖 | 不引入新运行时依赖（不装解释器/不装 Python） |

---

## 8. 分阶段计划

| 阶段 | 内容 | 出口 |
| --- | --- | --- |
| **P0 决策** | 拍板 D1–D4（见 §12）；确认与 09-03 的合并方式 | 决策记录写入本文件 |
| **P1 客户端契约** | `CatalogPackType` 联合化 + `voice-provider` schema/归一化/表/activate/rollback + focused tests | 与 09-03 同一套 catalog 测试同源通过 |
| **P2 服务端只读路由** | Nexus 静态投影 + 签名产物构建脚本 + 缓存/404 语义 + route tests | 本地 Pages + 本地 R2 可拉取 |
| **P3 运行时接入** | `nexus-pack` 解析分支 + 复用 buffered adapter + sdkapi/expiry/协议/模型/来源/限额 fail-closed + 诊断状态 | 本地合成 PCM 经 active descriptor 路由产出 final/end；无 active pack 保留内置路由 |
| **P4 触发面** | 登录后一次 + 设置页手动 + 状态/回滚 UI | 全链路证据 |
| **P5 端到端门禁** | §9 全量（含负向） | Evidence Matrix |

每阶段独立可回滚；P3 之前不改变任何用户可见行为。

---

## 9. 全链路测试方案

**分层**（沿用仓库 evidence 分层口径）：

1. **focused / unit**：归一化器（未知键、越界、坏 URL、坏协议）、验签（伪造签名、摘要篡改、keyId 伪装）、解密（错 key/截断/篡改 tag）、SQLite 事务回滚、activate/rollback 原子性、`minSdkApi` 判定、adapter 装配参数。
2. **controlled integration**：本地 Pages + 本地 D1/R2，`check → download → import → activate → rollback` 全链；断网、过期、降级版本、服务端 404/500。
3. **packaged Electron + 真实 Provider**：真机登录 → 自动同步 → 激活 → VoicePanel 真实录音转写 → transcript/provider/model/latency 投影正确 → 回滚后回到内置路由。
4. **负向门禁清单**（必须逐条有断言，不接受「N/A」）：伪造签名、payload 篡改、manifest 重放（旧 version 覆盖新 version）、过期包、撤销（服务端下线 pack 后客户端行为）、密钥轮换、登录切换账号、越权协议（包内出现未枚举 protocol）、资源耗尽（超大 payload / 超长字符串 / 超多 provider）、秘密泄漏扫描（日志/配置/同步 payload 中不得出现 token）。

**证据要求**：每层都要有可复核命令与产物；不得用 historical 结果替代当前版本证据（§2/§4.8 口径）。

---

## 10. 验收清单

- [ ] 功能验收：登录 → 自动同步 → 激活 → 语音走包内路由 → 回滚，核心场景与失败路径均可见
- [ ] 质量验收：typecheck / scoped lint / focused tests / packaged 证据，或记录既有失败项
- [ ] 性能验收：登录后同步不进入首屏关键路径；包解析 ≤ 预算（待定，建议 < 50 ms / < 1 MiB）
- [ ] 安全验收：验签、加密 envelope、凭据边界、日志无秘密、无新增动态执行
- [ ] 文档验收：按影响同步 `INDEX` / `TODO` / `CHANGES` / Roadmap / Quality Baseline（任务已注册为 `09-13-voice-provider-cloud-pack`；`TODO.md` 仅在执行线轮到本条时同步）
- [ ] 回滚验收：`rollback` + 内置包回退 + 删除远端包后的行为明确

---

## 11. 回滚与兼容

- **客户端回滚**：`rollback('voice-provider', reason)` 只切回上一个已导入 active pack；没有 previous 时返回稳定失败并保留当前 active。未激活任何云端包的客户端使用内置 Nexus buffered route。
- **服务端撤回**：删除内容寻址 payload，并删除 `VOICE_PROVIDER_CATALOG_KEYS` 中对应 `type/packId/version/keyId` 项；尚未导入的客户端得到 404/`payloadKeyUnavailable`，保持当前 active 不变。已激活客户端不受静态路由控制，且拒绝降级；其远程强制撤回需要未来独立的签名指令契约，当前安全恢复是发布更高版本修复包或用户本机回滚，`latest` 不得回指旧版本冒充撤销。
- **旧客户端**：不认识 `nexus-pack` 协议 → 明确 `unsupported` 原因；未激活云端包时继续用内置 Nexus buffered route，服务端不得因为新包存在而破坏旧客户端。
- **数据兼容**：新增表为加法迁移；`catalog_packs` 主键扩展为 `(type, pack_id)` 需 schema 迁移与回滚脚本。

---

## 12. 决策记录（2026-09-13 锁定）

用户确认「新增一套这套系统」，按下列方案执行。以下是**已生效**的决策，变更需重开本 PRD 并同步任务 `09-13-voice-provider-cloud-pack`。

| # | 决策 | 已选 | 边界 |
| --- | --- | --- | --- |
| **D1** | 「脚本」形态 | **(a) 声明式描述符** | 本任务零新增动态执行；(b) 可执行脚本 + 沙箱另立 PRD、独立沙箱与预算 |
| **D2** | 交付通道 | **(a) Catalog 家族** | 不用 Sync（无签名语义、污染用户数据通道），不用 `.tpex`（面向可执行插件） |
| **D3** | 「加密」目标 | **(a) 签名 + envelope 机密性** | 「让用户拿不到协议」是 Non-goal：客户端能解密 ≠ 秘密；包内恒不放凭据 |
| **D4** | 触发策略 | **(a) 登录后一次 + 手动** | 仅登录时一次、fire-and-forget、不进启动 critical path；**本条改写 09-03 记录的 "No startup fetch"**，09-03 若实施需同步修订 |
| **D5** | 覆盖范围 | **(a) 只描述 Nexus 语音** | 三个硬编码协议迁移到包 = 后续独立任务 |
| **D6** | 与 09-03 的关系 | **(a) 合并：本任务做类型联合化** | 本任务拥有 `CatalogPackType` 的加法式泛化；09-03 只消费、不重复重构 |
| **D7** | envelope key 分发 | **登录态每包 DEK** | 公共 R2 只存 A256GCM envelope；鉴权 key route 返回当前包 key，保护匿名/静态读取但不宣称对已登录用户保密；固定客户端 key 禁止 |

---

## 13. 关联入口

- Catalog 完成边界：[`../../engineering/catalog-service-boundary.md`](../../engineering/catalog-service-boundary.md)
- 远程别名目录先例：`.trellis/tasks/09-03-remote-app-alias-catalog/design.md`
- ASR Provider Runtime：[`ai-2.5.8-asr-provider-runtime-prd.md`](./ai-2.5.8-asr-provider-runtime-prd.md)
- Nexus AI 计费：`.trellis/tasks/09-08-nexus-ai-channel-billing/`
- 语音会话统一：`.trellis/tasks/09-04-unify-voice-session-rust/`
- 语音 Provider 通道持久化：`.trellis/tasks/09-08-persist-asr-provider-channels/`
- 质量基线：[`../PRD-QUALITY-BASELINE.md`](../PRD-QUALITY-BASELINE.md)

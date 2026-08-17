# 技术设计：三插件本地市场端到端打通

> **修正记录（2026-08-15）**：本文档第一版的 §1.1 / §1.2 结论是错的，基于了一个**过期的 miniflare 状态目录**。
> 错误内容与更正见 §0，保留是为了让后来者知道这个坑在哪。

## 执行结果（2026-08-17）

最终本地公开目录为三条真实 `RELEASE`：

| slug | version | 结果 |
|---|---:|---|
| `com.tuffex.clipboard-history` | `1.1.11` | approved / available / eligible |
| `com.tuffex.json-formatter` | `1.0.8` | approved / available / eligible |
| `com.tuffex.translation` | `1.0.17` | approved / available / eligible |

`/api/store/plugins?compact=1` 返回 `total: 3`。三个版本均由本次发布产生，具备
publisher signature、publisher verified time、Nexus attestation、passed policy/scan 和
eligible admission；没有直接写 D1 制造可见性。

### 可复现上架步骤

1. 确认 Nexus 使用仓库根 `.wrangler/state/v3`，备份活 D1；不要读取
   `apps/nexus/.wrangler` 的过期数据。
2. 在 `apps/nexus/.env.local` 配置本地 Ed25519 attestation 私钥和稳定 key id，启动
   `NUXT_USE_CLOUDFLARE_DEV=true` 的 Nexus。核心应用用同一密钥对的公钥追加
   `TUFF_PLUGIN_TRUST_ROOTS_JSON`，不替换内置信任根。
3. 执行 `tuff --local login`。发布者 Ed25519 私钥只放在仓库外的 `0600` 文件，发布时设置：

   ```bash
   TUFF_PLUGIN_SIGNING_PRIVATE_KEY_FILE=<private.pem> \
   TUFF_PLUGIN_SIGNING_KEY_ID=<stable-key-id> \
   tuff --local publish --channel RELEASE
   ```

4. Dashboard slug 必须逐字等于 `.tpex` 内的 `manifest.id`。CLI 不得把合法连字符改成点；
   否则服务端 Package Policy 会报 `PLUGIN_PACKAGE_EXPECTED_ID_MISMATCH`。
5. 首次发布前在 Dashboard 创建同 slug 的插件元数据（图标、README、分类）。官方仓库插件
   在本地标记 `isOfficial: true`；版本审核仍走真实管理员接口。
6. `json-formatter` 的 Monaco / expression-query findings 使用管理员创建的、按本次
   `artifactSha256` 限定且有到期时间的 server-owned waiver。不要关闭扫描器，也不要沿用
   上一构建摘要。开发目录的 `security-waivers.json` 仍按具体文件摘要限制。
7. 每个插件依次发布，遵守同一发布者五分钟提交冷却；再将 plugin/version 状态审核为
   `approved`。审核时服务端签发 admission attestation。
8. 核心应用隔离 profile 将 Runtime API server 切到 `http://localhost:3200`，搜索名称与
   中英文关键词，安装、授予声明权限、启用并执行主功能。
9. 更新大插件时，Surface 的 `plugin:install-source` 请求使用三分钟有界超时；安装进度和
   非官方确认仍保留，不能把超时改成无限等待。

### 本次发现并修复的链路缺陷

| 缺陷 | 修复 |
|---|---|
| CLI 将 `manifest.id` 的 `-` 改成 `.` | manifest id 作为 Dashboard slug 原样保留 |
| Store 路由组件是 fragment，外层 Transition 不渲染 | `Store.vue` 改为单根视图 |
| 大包安装超过默认响应窗口后假失败 | Plugin SDK 安装请求使用三分钟有界超时 |
| 插件视图网络 SDK 没有 raw-channel → typed transport 桥 | NetworkModule 以当前 activation/sender 重入 typed permission guard |
| `PluginFeature` class 直接跨隔离 wire | 生命周期调用前转成 plain DTO |
| Translation 同时声明 `main` 与 `build.index`，随后又把 packaged `index.js` 当 source | 最终只声明 `main: index.js` |
| Clipboard 权限错误被 SDK 归一化为空历史 | 错误形响应直接抛出并在 Surface 显示 banner |

### 功能验收摘要

- `clipboard-history`：连续三条测试记录可见；选中记录可写回系统剪贴板；撤销
  `clipboard.read` 后显示明确 permission-denied banner。
- `json-formatter`：合法 JSON 自动格式化，非法 JSON 有错误反馈；激活后 CoreBox 输入收起、
  左编辑器自动聚焦、前缀图标可见、Pin 靠右；双栏跟随滚动可开关。
- `touch-translation`：MyMemory 通过 permission-gated host Network SDK 完成真实
  `Hello world` → 中文翻译；Custom 测试密钥可从 Secret SDK 回读，普通 plugin storage 与
  整个隔离 profile 均检索不到该明文标记。注入 `PERMISSION_DENIED` 的隔离 Prelude 探针返回
  明确「翻译权限未授予」结果；Secret 批量写失败的 fail-closed 路径由现有测试覆盖。

## 〇、一个必须先讲的坑：两个 `.wrangler` 目录

`apps/nexus/nuxt.config.ts:396` 把 miniflare 的 `persistDir` 指向**仓库根**：

```ts
cloudflareDev: {
  configPath: resolve(workspaceRoot, 'wrangler.toml'),
  persistDir: resolve(workspaceRoot, '.wrangler/state/v3'),
}
```

所以：

| 路径 | 状态 | 内容 |
|---|---|---|
| `.wrangler/state/v3/d1/…`（仓库根） | **活的**，dev server 实际读写 | `dashboard_plugins` **0 行**；3 个用户**全是 admin** |
| `apps/nexus/.wrangler/state/v3/d1/…` | **过期**，2026-05 之后再没被读写 | 3 个 approved 插件、旧 schema |

排查时按直觉去看 `apps/nexus/.wrangler` 会得到完全相反的结论。**先确认 persistDir，再看数据。**

第一版文档就是这么错的：在过期目录里看到三个 approved 插件，又发现它们缺新 schema 列，
于是推断「dev server 没绑 D1」。实际上 `ps -E` 显示运行中的进程由 `pnpm -F @talex-touch/tuff-nexus run dev`
拉起，`NUXT_USE_CLOUDFLARE_DEV=true`、`CLOUDFLARE_DEV_ENVIRONMENT=preview` 都在环境里，D1 绑定正常。

## 一、本地为空的真实原因

**本地 D1 里一个插件都没有。** 活的库 `dashboard_plugins` 是 0 行，schema 已经是最新
（`artifact_sha256`、`publisher_signature`、`publisher_verified_at`、`nexus_attestation`、
`admission_status`、`policy_decision`、`artifact_state`、`security_scan_*`、`eligibility_*` 全在）。

所以 `/api/store/plugins` 返回 `total: 0` 是**如实反映**，没有 bug。要让市场有东西，就得真发布。

已经不需要做的事（第一版计划里有，现已删除）：

- ~~提权一个用户为 admin~~ —— 活库里 3 个用户 role 全是 `admin`。
- ~~迁移旧插件行~~ —— 那些行在过期目录里，与本地运行时无关。

## 二、上架门槛（仍然全部有效）

`getPluginVersionEligibility`（`apps/nexus/server/utils/pluginsStore.ts:1023`）对 `public` audience 逐项判定，
全过才可见；任一不过则该版本不可见，无可见版本时整个插件从目录消失：

| 判定项 | 要求 | 来源 |
|---|---|---|
| `pluginStatus` | `approved` | 管理员审核 |
| `versionStatus` | `approved` | 管理员审核 |
| `channel` | **`RELEASE`**（public 只放行这一档） | `tuff publish --channel RELEASE` |
| `artifactState` | `available` | 上传产物 |
| `policyDecision` | `passed` | 签名 payload 的 `policyVersion` |
| `scanDecision` | `passed` 或 `review-required` | 服务端安全扫描 |
| `publisherTrust` | `verified`（需签名 + 公钥 + `publisherVerifiedAt` 三者齐全） | 发布者签名密钥 |
| `nexusAttestation` | `verified` | **服务端签发，见 §3** |
| `admissionDecision` | `eligible` | attestation payload 内的 `admission` |

## 三、当前最大的阻塞：本地没有 attestation 私钥

`createPluginAdmissionAttestation`（`apps/nexus/server/utils/pluginSigning.ts:483`）需要两个 secret：

- `PLUGIN_ATTESTATION_PRIVATE_KEY_PEM`（必须是 **ed25519**，否则 `PLUGIN_ATTESTATION_ALGORITHM_DENIED`）
- `PLUGIN_ATTESTATION_KEY_ID`（需匹配 `KEY_ID_RE`）

读取路径是 `readAttestationSecret`（`pluginSigning.ts:473`）：先读 Cloudflare binding，再读 `process.env`，
**都没有就 `signingError('PLUGIN_ATTESTATION_KEY_UNAVAILABLE', 503)`**——fail-closed，不会静默降级。

本地 `apps/nexus/.env.local` 现有的变量是
`AUTH_ORIGIN AUTH_SECRET GITHUB_* LINUXDO_* RESEND_API_KEY AUTH_EMAIL_FROM TURNSTILE_* EXCHANGE_RATE_API_KEY ADMINSECRET`，
**没有任何 attestation 相关项**。`wrangler.toml` 里也没有。

好消息是这条链路本来就为本地开发留了口子：

1. `readCloudflareBindings`（`apps/nexus/server/utils/cloudflare.ts:33`）在
   `NODE_ENV !== 'production' && NUXT_USE_CLOUDFLARE_DEV === 'true'` 时，
   会把 `PLUGIN_ATTESTATION_PRIVATE_KEY_PEM` 等一批凭据从 `process.env` 注入 binding。
2. 客户端侧的信任根可扩展：`apps/core-app/src/main/modules/plugin/signature-verifier.ts:69`
   读 `TUFF_PLUGIN_TRUST_ROOTS_JSON`，解析后**追加**到内置信任根，而不是替换。

所以本地方案是：**自签一把 ed25519 密钥，服务端用私钥签发 attestation，核心应用把对应公钥加进信任根。**
生产的判定逻辑一行都不动。

## 四、目标链路

```
生成本地 ed25519 密钥对
  → apps/nexus/.env.local: PLUGIN_ATTESTATION_PRIVATE_KEY_PEM + PLUGIN_ATTESTATION_KEY_ID
  → 重启 pnpm nexus:dev
  → 注册发布者签名密钥（/api/dashboard/plugin-signing-keys）
  → tuff build (.tpex)
  → TUFF_NEXUS_BASE_URL=http://localhost:3200 tuff login <token>
  → tuff publish --channel RELEASE
  → 管理员审核：PATCH /api/dashboard/plugins/<id>/status
                PATCH /api/dashboard/plugins/<id>/versions/<versionId>
  → GET /api/store/plugins  出现在目录
  → 核心应用（TUFF_PLUGIN_TRUST_ROOTS_JSON + runtimeServer=local）搜索 / 安装 / 运行
```

### 硬约束

- `manifest.version` 必须等于 `package.json.version`，否则 `tuff publish` 直接退出。
- channel 由 tag 推断：tag 含 `alpha`/`beta`/`snapshot` 就不是 RELEASE。三个插件都要发 RELEASE。
- 发布需要 `plugin:publish` scope（`versions.post.ts` 的 `requireAuthOrApiKey`）。
- 审核强制管理员（`versions/[versionId].patch.ts:33`）——本地已满足。
- base URL 走 `TUFF_NEXUS_BASE_URL`（`tuff-cli-core/src/publish.ts:527` 的 `getTuffBaseUrl()`）。

## 五、三个插件各自的适配面

三者当前都是 `sdkapi: 260615`，目标 `260713`（`CURRENT_SDK_VERSION`）。
`260615` 仍在 `SUPPORTED_SDK_VERSIONS` 内，所以不是被拦，是落后两档：
`260626` 引入 SemanticAliasSDK，`260713` 引入插件 i18n / Domain Lexicon facade
（`LOCALIZATION_FACADE_MIN_VERSION`）。只改数字不算适配。

### clipboard-history（仓库内，v1.1.10）
manifest 规范度最高：permissions 带 reason、searchProviders 齐全。适合做链路探针。

### touch-translation（仓库内，v1.0.11）
权限面最大（`network.internet` / `intelligence.basic` / `storage.plugin` / `search.root-results` +
可选 `clipboard.write`）。manifest 声明「隔离 Prelude 不直接联网」，需实测确认该边界仍成立。
它有中英双语搜索关键词，是 `260713` localization facade 最可能真正用得上的一个。

### json-formatter（**仓库外**，v1.0.5）
从 `github.com/talex-touch/json-formatter` 引入，需要改造：

1. manifest **无 `permissions` 块**——`plugins/AGENTS.md` 要求必须声明且带 reason。
2. `package.json` 的 `build` / `publish:nexus` 硬编码了本机绝对路径 `/Users/talexdreamsoul/…/tuff.js`。
3. 包名 `json-formatter` → 规范要求 `@talex-touch/json-formatter-plugin`。
4. `dev.enable: true` 指向 `localhost:5555`。
5. 无 `build.index`，需确认 Prelude 形态（仓库根有 `index.js`）。
6. 停更近两个月，调用面漂移风险三者最高。

## 六、方案取舍

| 方案 | 说明 | 取舍 |
|---|---|---|
| **A. 自签本地信任根，走完整发布链路**（选定） | 生成 ed25519 密钥，服务端签发 attestation，客户端追加信任根 | 生产判定逻辑零改动；本地能真实验证签名、扫描、审核全链路 |
| B. 直接 INSERT/UPDATE D1 | 手工造出可上架的行 | 5 分钟见效，但验证的不是链路而是我自己造的数据；PRD 约束 4 明确排除 |
| C. 给 eligibility 加本地开关 | 本地跳过 attestation 判定 | 削弱生产语义，且掩盖真实问题；排除 |

## 七、风险

1. **发布者签名密钥的注册流程未验证**。`getPublisherSigningKey` 找不到密钥会 `PLUGIN_SIGNING_KEY_UNKNOWN`，
   需要先走 `/api/dashboard/plugin-signing-keys`。这是链路里第二个可能卡住的点。
2. **安全扫描在本地的行为未知**。`scanDecision` 必须是 `passed` 或 `review-required`，
   本地扫描器是否可用、会不会直接 `not-evaluated`，需实测。
3. **`json-formatter` 改造量可能超预期**（停更两个月 + 权限声明从零补）。
4. 本地 D1 已备份至 `~/Backups/tuff-d1-20260815/`（仓库外，避免 22MB sqlite 进 git）。

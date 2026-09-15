# CatalogService 完成边界

> 更新时间：2026-09-13
> 定位：R8-F CatalogService 的 **2026-08-20 domain-lexicon 基线**。`voice-provider` 已于 2026-09-13 接出登录触发、typed host controls、Settings 状态页、A256GCM artifact、Nexus routes 与 main-owned `nexus-pack` runtime，当前边界见 [`plan-prd/03-features/voice-provider-cloud-pack-prd.md`](../plan-prd/03-features/voice-provider-cloud-pack-prd.md)。下文历史结论不得外推到 `voice-provider`。

## 一句话结论

**2026-08-20 的 domain-lexicon 结论：服务契约完成，远程触发未接出。** 当时除内置 pack seed/activate 外，运行中应用没有调用远程更新阶段；这仍描述 `domain-lexicon`，但已不描述 `voice-provider`。

把历史“CatalogService 只有测试调用方”继续套到整个 Catalog 家族是错的；`voice-provider` 现在已有登录后一次同步、手动 check/sync/rollback，以及每次语音采集前的 active descriptor 读取。

## 已完成（2026-08-20 复核）

任务 PRD 的 8 条功能验收逐条对照源码复核通过。落点：

| 层 | 位置 |
| --- | --- |
| 主进程模块 | `apps/core-app/src/main/modules/catalog/`（`index.ts` 装配与 trust root、`catalog-service.ts` 编排、`catalog-repository.ts` SQLite 生命周期、`catalog-remote.ts` Nexus 适配、`catalog-verifier.ts` 验签） |
| 共享契约 | `packages/utils/i18n/`（`catalog.ts` 归一化与错误码、`lexicon.ts`、`scoped-lexicon.ts` 插件 overlay、`unit-lexicon.ts` 内置 baseline 与 official facade） |
| 插件接出 | `apps/core-app/src/main/modules/plugin/plugin-localization-channels.ts` |
| 表结构 | `apps/core-app/src/main/db/schema.ts`，迁移 `resources/db/migrations/0026_catalog_service.sql` |
| 信任根 | `apps/core-app/resources/keys/release-signing-public.pem`（仅公钥） |
| 模块注册 | `apps/core-app/src/main/index.ts` — `catalogModule` 在 `databaseModule` 之后、`permissionModule` / `pluginModule` 之前 |

几条值得单独记的安全性质：

- **manifest 无法自带授权密钥。** `PinnedCatalogVerifier` 只接受 `loadCatalogTrustRoot()` 从打包路径读出的 PEM，且拒绝非 RSA 密钥；`keyId` 是字面量 `"release-v1"`，归一化阶段用 `requireLiteral` 校验，验签路径从不拿 `manifest.keyId` 去查表 —— 它是标签，不是间接层。
- **pack URL 是内容寻址的，且由签名字段重新推导。** 敌意的 `artifactUrl` 覆盖会被忽略。
- **JSON 字节只是导入输入。** activate / rollback 一律重新读 SQLite 行来重建 registry，从不复用内存里那份已验签的 pack。
- **registry 只在持久化提交之后才换。** `index.test.ts` 把 `repository.activatePack` 挂在一个手动控制的 pending promise 上，断言写入在途时 `publishRegistry` 没有被调用过。

### 测试证据

在与本文同源的工作区实测，非引用历史结论：

| 套件 | 结果 |
| --- | --- |
| `apps/core-app` catalog 6 个文件（含 `catalog-lifecycle.integration.test.ts`） | 38/38 通过 |
| `apps/core-app` `plugin-localization-channels.test.ts` | 12/12 通过 |
| `packages/utils` i18n 4 个文件（含 `active-official-lexicon.test.ts`） | 36/36 通过 |
| 两个包各自的 eslint 配置 | 0 error |
| `tsconfig.node.json` / `tsconfig.web.json` typecheck | 0 error |

## 2026-08-20 未完成项：仅 domain-lexicon

这是本文档的核心，也是任务 PRD 那 8 个 `[x]` 无法自己说清楚的部分。

**domain-lexicon 的远程更新仍无产品调用方。** 它的 `checkUpdates` / `downloadPack` / `importPack` / `activatePack` / `rollback` 保持显式服务 API。`voice-provider` 不同：`CatalogModule` 已在登录状态转换中运行 check→download→key→decrypt→import→activate，并注册 host-only typed controls；`voice-provider-runtime` 每次采集前读取 active registry，冻结同源 Nexus descriptor/model 与收紧后的限额。

**domain-lexicon 状态仍无渲染出口；voice-provider 已有。** `/setting/intelligence/voice` 只接收安全的 `CatalogStatus`/`CatalogPackDiagnostic` 投影，展示 active/previous、ciphertext hash、签名状态与稳定错误码；raw envelope、DEK、签名和 payload 不跨 IPC。运行时的 pack expiry/sdkapi/protocol/origin/model 失败另以 `VOICE_ASR_PACK_*` 投影，并将恢复动作导向该页的云端路由控件。

**今天真正在跑的只有 read 路径。** 启动时 seed 并激活内置 pack，插件通过 `officialDomainLexiconRegistry` facade 读到当前 official registry，activate 时 facade 保持对象身份不变而内容被替换，插件 overlay 与跨插件隔离在 activate→rollback 全程保持。这条链路是活的、被测试的、被使用的。

上述历史边界对 `domain-lexicon` 仍成立；`voice-provider` 的触发/状态面由独立 PRD 显式扩展，不代表自动轮询，也不允许 renderer 解析包。

## 明确不在范围内（复核未越界）

2026-08-20 时 `CatalogPackType` 还是字面量 `"domain-lexicon"`；现在已加法式扩为 `"domain-lexicon" | "voice-provider"`，并保持两种 entry/registry/persistence 类型隔离。仍没有 delta patch 或 mutable catalog 业务表；插件 overlay 继续只驻内存。

## 后续云控类型扩展契约

Catalog 是声明式可信内容的**交付平面**，不是脚本平台。后续类型可以复用 manifest/signature/content-address/envelope/key identity/SQLite lifecycle，但必须各自增加随客户端发布的 typed normalizer、typed rows、runtime adapter 和失败码；不得把 arbitrary JSON、表达式或下载代码塞进共享 evaluator。

远程 check/download/key/activate 统一以登录完成为前提，未登录必须在网络前返回 `CATALOG_AUTH_REQUIRED`。status 与本地 rollback 保持可达。云控包只调整客户端已实现的参数，不得打开本机可选功能、权限或麦克风；新增实质性类别/用途前同步用户协议或独立告知。

## 一处悬空引用

任务 PRD 第 7 行称「详细 EARS 契约是 `.spec-workflow/specs/catalog-service-mvp/requirements.md`」。**该文件在本仓库的 git 历史中从未存在过**（`git log --all --diff-filter=A` 对该路径无结果）。引用它的地方应改为指向本文与共享契约源码，否则读者会去找一份不存在的规格。

## 如何复核

```bash
# 服务契约
cd apps/core-app && npx vitest run src/main/modules/catalog
cd packages/utils && npx vitest run __tests__/i18n

# domain-lexicon 产品触发仍为空；voice-provider 的触发和 transport 证据改看其任务测试
grep -rn "checkUpdates('voice-provider')" apps/core-app/src/main/modules/catalog
node ../../node_modules/vitest/vitest.mjs run \
  src/main/modules/catalog/index.test.ts \
  src/renderer/src/views/base/settings/VoiceProviderCatalogSettings.test.ts
```

核对时必须按 pack type 区分：`domain-lexicon` 的历史产品边界不能代替 `voice-provider` 的当前触发、加密和 Settings 证据。

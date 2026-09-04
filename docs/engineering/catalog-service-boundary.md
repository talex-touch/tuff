# CatalogService 完成边界

> 更新时间：2026-08-20
> 定位：R8-F CatalogService MVP 的已完成/未完成边界。任务契约见 [`.trellis/tasks/07-13-catalog-service-mvp/prd.md`](../../.trellis/tasks/07-13-catalog-service-mvp/prd.md)，产品契约见 [`plan-prd/03-features/i18n-lexicon-catalog-2.6.0-prd.md`](../plan-prd/03-features/i18n-lexicon-catalog-2.6.0-prd.md)。

## 一句话结论

**服务契约已完成并可验证；触发面尚未接出。** CatalogService 的验签、导入、激活、回滚全部实现且有测试覆盖，但除内置 pack 的 seed/activate 之外，**运行中的应用没有任何代码路径会调用它们** —— 远程更新那一半今天只能从测试里到达。

把「CatalogService 已完成」读成「用户或运维今天可以更新 catalog」是错的，这份文档存在的唯一目的就是拦住这个误读。

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

## 未完成：已实现但运行时不可达

这是本文档的核心，也是任务 PRD 那 8 个 `[x]` 无法自己说清楚的部分。

**远程更新全链路没有调用方。** `checkUpdates` / `downloadPack` / `importPack` / `activatePack` / `rollback` 实现完整、测试充分，但在 `apps/core-app/src` 与 `packages/` 中，除 `modules/catalog/` 自身及其测试外没有任何调用点。仓库里其它 `checkUpdates` 调用属于插件商店与 agent store，其它 `rollback` 调用属于 `invocation` / `buffer` / 插件 host registry，都是同名不同物。

**诊断状态算得出来，但没有出口。** `getCatalogService()` 在 catalog 模块之外零调用方，没有 IPC channel、没有诊断页、没有渲染端消费者会读 `getStatus()`。`CatalogStatus` 的字段是对的，可用性、active/previous 身份与 hash、签名状态、更新时间、回滚原因、稳定错误码都在 —— 但今天它是一个内部 API 契约，不是可观测的功能。

**今天真正在跑的只有 read 路径。** 启动时 seed 并激活内置 pack，插件通过 `officialDomainLexiconRegistry` facade 读到当前 official registry，activate 时 facade 保持对象身份不变而内容被替换，插件 overlay 与跨插件隔离在 activate→rollback 全程保持。这条链路是活的、被测试的、被使用的。

上述三点与 PRD 的 Scope Boundaries 一致（不做 Settings UI、不做自动轮询），**不是缺陷**。记录它们是因为「done」在这里的含义是「服务契约成立」，不是「能力已交付给用户」。要让它成为可交付能力，还需要一个触发面（Settings 入口、IPC channel 或运维命令）与一个状态展示面 —— 两者都在本批范围之外。

## 明确不在范围内（复核未越界）

`CatalogPackType` 是字面量 `"domain-lexicon"` 而非联合类型，`CATALOG_SCHEMA_VERSION` 固定为 1，没有 delta patch 路径、没有发布/管理 API、没有 D1/R2 代码、渲染端零 catalog 引用、插件 overlay 只在内存 `Map` 中不持久化。既有单位换算行为与 `KB` / `Kb` 语义未改动。

## 一处悬空引用

任务 PRD 第 7 行称「详细 EARS 契约是 `.spec-workflow/specs/catalog-service-mvp/requirements.md`」。**该文件在本仓库的 git 历史中从未存在过**（`git log --all --diff-filter=A` 对该路径无结果）。引用它的地方应改为指向本文与共享契约源码，否则读者会去找一份不存在的规格。

## 如何复核

```bash
# 服务契约
cd apps/core-app && npx vitest run src/main/modules/catalog
cd packages/utils && npx vitest run __tests__/i18n

# 「无调用方」这一条 —— 注意先确认扫描本身有效（正控）
grep -rln "CatalogService" apps/core-app/src --include="*.ts" | grep -v node_modules   # 应能列出 catalog 模块文件
grep -rn "getCatalogService" apps/core-app/src packages --include="*.ts" --include="*.vue" \
  | grep -v node_modules | grep -v "modules/catalog/"                                   # 应为空
```

第二条命令若返回空，先跑第一条确认 grep 确实看得见这些文件 —— 一个拼错的路径同样返回空，而那看起来和「没有调用方」一模一样。

# Tuff 2.6.0 i18n / Domain Lexicon / Cloud Catalog 收敛 PRD

> 更新时间：2026-07-13
> 状态：In Progress — Phase 0-4 implemented；Phase 5-6 planning
> 目标版本：2.6.0
> 定位：统一 CoreApp / Nexus / packages / plugins 的多语言、领域词库、插件本地化与云端 Catalog 下载架构。

## 0. 当前实现状态

- R8-D Domain Lexicon V1 已于 2026-07-13 完成：`packages/utils/i18n` 提供带 `source` provenance 的只读 `DomainLexiconRegistry`、53 个内置单位 canonical entries 与共享 conversion source，支持跨 locale aliases、确定性排序和当前 locale label 投影。
- R8-E Plugin SDK facade 已于 2026-07-13 完成：`sdkapi 260713` 暴露 main/renderer 同构 i18n/lexicon facade，typed transport 只接受 verified context，并由 `i18n.read`、`lexicon.read`、`lexicon.register` fail-closed；plugin-local entries 由宿主命名/provenance、原子有界注册且 disable/unload 清理。
- Phase 5 CatalogService 与 Phase 6 Quality Gates 仍保持开放；本批不代表 SQLite catalog、签名 pack 或 CI 门禁已完成。

## 1. Final Goal / North Star

2.6.0 需要把 Tuff 的多语言能力从“各处自行写中英文适配”收敛为一套可扩展、可验证、可开放给插件开发者的基础能力。最终状态不是只补 UI 翻译 key，而是把 UI 文案、跨进程消息、单位/币种/时区等领域词库、插件 manifest 本地化元信息，以及未来从云端下载的公开 catalog 数据分层治理。

业务目标：

- 用户切换语言后，CoreApp、Nexus、系统通知、插件展示、单位换算、搜索别名与错误提示保持一致，不出现中文 fallback 泄露、裸 key 泄露或一半中文一半英文的界面。
- 插件开发者可以通过 SDK 使用官方 locale、localized text resolver、domain lexicon 查询与插件自有本地化 metadata，不需要自己散写 `startsWith('zh')` 或硬编码双语分支。
- 单位、币种、时区、能力标签、搜索别名等领域数据可以随 2.6.0 之后的云端 catalog 增量下载更新，但本地 SQLite 仍是运行时 SoT。

工程目标：

- 建立单一 locale core，统一 `zh-CN/en-US` 与 `zh/en` 的转换边界。
- 建立 `LocalizedText` / `LocalizedList` 标准类型，让 UI、插件 manifest、domain lexicon 与 catalog payload 共享同一套解析语义。
- 建立 domain lexicon registry，把单位等领域数据从普通 UI messages 中拆出，支持“解析所有语言别名、展示当前语言标签”的模型。
- 建立 CatalogService：下载、验签、schema 校验、导入 SQLite、激活版本、回滚版本统一处理，禁止各模块私自 fetch + JSON 落盘。
- 建立质量门禁：locale key 对齐、禁止新增中文 fallback、禁止生产 UI 新增双语三元表达式、domain lexicon locale coverage、catalog hash/signature/schema 校验。

## 2. Problem Statement

当前项目已经有多套 i18n 入口并行：

- CoreApp renderer 使用 `vue-i18n` 与 `zh-CN/en-US` locale。
- CoreApp main 有独立 helper，并直接读取 renderer locale JSON。
- `packages/utils/i18n` 有 `$i18n:key` resolver，locale 是 `zh/en`。
- Nexus 使用 Nuxt i18n，locale 也是 `zh/en`，并且存在大量 `t(key, '中文 fallback')` 与 `locale === 'zh' ? ... : ...`。
- 单位、币种、时间、能力标签、搜索别名等领域数据混在普通 JSON、代码常量、provider 逻辑或搜索 parser 中。

这些问题的本质不是“中文太多”，而是 **UI Messages、Transport Messages、Domain Lexicon、Plugin Metadata、Cloud Catalog 没有分层**。单位别名这类内容必须多语言，但不能作为普通 UI 文案处理；它们参与解析、搜索召回、评分与展示，需要有独立 canonical id、别名、标签、版本和来源。

## 3. Scope

### 3.1 UI Messages

按钮、标题、placeholder、toast、空状态、表格列名、确认弹窗等用户界面文案统一走 UI message catalog。

约束：

- CoreApp UI 使用 `t(key)`，不新增 `t(key, '中文 fallback')`。
- Nexus 页面使用 Nuxt i18n key，不新增中文 fallback 作为生产默认路径。
- 缺 key 必须在开发/CI 检查暴露，不用 fallback 掩盖。

### 3.2 Transport Messages

主进程、插件进程、后台服务传给 renderer 的用户可见消息统一走可传输消息协议。

约束：

- 使用 `$i18n:key|params` 或后续 typed wrapper 表达消息。
- renderer 负责按当前 locale resolve。
- 后端不得把用户可见中英文句子作为长期协议值。

### 3.3 Domain Lexicon

单位、币种、时区、文件类型、能力标签、搜索别名、系统动作别名等进入 domain lexicon。

约束：

- 每条记录有 canonical id。
- 解析时支持所有 locale 的 aliases。
- 当前 locale aliases 可获得更高 ranking boost。
- 展示时使用当前 locale 的 label。
- 领域词库不塞进普通 UI message JSON。

### 3.4 Plugin Localized Metadata

插件 manifest 中的 name、description、features、commands、errors、permission reasons 支持 localized value。

约束：

- manifest 必须有 `default`。
- `locales` 只能使用规范 `AppLocale`。
- 插件自有本地化只影响插件自己的展示与搜索，不得覆盖官方全局 lexicon。

### 3.5 Cloud Catalog

2.6.0 之后很多公开数据会从云端下载，包括 domain lexicon、capability registry、model registry、plugin registry、release metadata 等。它们统一由 CatalogService 管理。

约束：

- 内置 baseline catalog 保证离线可用。
- 云端 catalog 是签名公开数据包，不是用户私有同步数据。
- 下载 payload 可短暂缓存为 content-addressed blob；验签和 schema 校验通过后导入 SQLite。
- SQLite 是运行时 SoT；catalog JSON 不作为可变业务数据长期 SoT。
- 用户私有同步仍走 `/api/v1/sync/*`，不能和公开 catalog 混用。

## 4. Non-goals

- 2.6.0 不要求一次性新增第三种 UI 语言，但数据结构必须允许后续扩展。
- 不在本项目内提供自动机器翻译作为权威翻译源。
- 不把所有领域词汇塞进 `en-US.json` / `zh-CN.json`。
- 不允许插件用 `lexicon.register()` 直接污染全局官方词库；第三方注册默认 plugin-scoped。
- 不把云端 catalog 作为网络强依赖；离线 baseline 必须可用。
- 不把用户私有数据、plugin storage、sync payload 或 secret 放进公开 catalog。

## 5. Architecture

### 5.1 Locale Core

新增共享 locale primitive，建议放入 `packages/utils/i18n/locale`：

```ts
export type AppLocale = "zh-CN" | "en-US";
export type ShortLocale = "zh" | "en";

export function normalizeLocale(input?: string | null): AppLocale | null;
export function toShortLocale(locale: AppLocale): ShortLocale;
export function toAppLocale(locale: ShortLocale | AppLocale): AppLocale;
export function getFallbackChain(locale: AppLocale): AppLocale[];
```

落地规则：

- CoreApp 内部以 `AppLocale` 为准。
- Nexus 可以继续使用 Nuxt i18n 的 `zh/en`，但边界必须通过 adapter 转换。
- packages 与插件 SDK 不再散写 `startsWith('zh')`。

### 5.2 Localized Value

新增标准本地化数据结构，建议放入 `packages/utils/i18n/localized`：

```ts
export interface LocalizedText {
  default: string;
  locales?: Partial<Record<AppLocale, string>>;
}

export interface LocalizedList {
  default: string[];
  locales?: Partial<Record<AppLocale, string[]>>;
}

export function resolveLocalizedText(
  value: string | LocalizedText,
  locale: AppLocale,
): string;
export function resolveLocalizedList(
  value: string[] | LocalizedList,
  locale: AppLocale,
): string[];
```

设计要求：

- `default` 是兼容与最小可展示值，不等同于 English。
- `locales[locale]` 缺失时走 fallback chain，再回到 `default`。
- resolver 必须是纯函数，可在 main、renderer、Nexus、CLI、插件 builder 中复用。

### 5.3 Domain Lexicon Registry

领域词库使用 canonical id + localized label + localized aliases。

```ts
export interface DomainLexiconEntry {
  id: string;
  domain:
    | "unit"
    | "currency"
    | "timezone"
    | "capability"
    | "fileType"
    | "systemAction";
  source: "builtin" | `catalog:${string}` | `plugin:${string}`;
  version: string;
  labels: LocalizedText;
  aliases: LocalizedList;
  searchBoost?: Partial<Record<AppLocale, number>>;
  deprecated?: boolean;
  replacedBy?: string;
  metadata?: Record<string, unknown>;
}
```

单位示例：

```json
{
  "id": "unit.length.km",
  "domain": "unit",
  "source": "builtin",
  "version": "260000",
  "labels": {
    "default": "km",
    "locales": {
      "zh-CN": "千米",
      "en-US": "kilometer"
    }
  },
  "aliases": {
    "default": ["km"],
    "locales": {
      "zh-CN": ["千米", "公里", "km"],
      "en-US": ["kilometer", "kilometers", "km"]
    }
  },
  "metadata": {
    "category": "length",
    "symbol": "km"
  }
}
```

单位解析规则：

- 用户输入解析支持所有 locale 的 aliases。
- 当前 locale aliases 加权更高，但不能阻止跨语言输入。
- 输出展示使用当前 locale label；专业符号保留 `symbol`。
- 搜索索引写入 aliases/token，但结果保留 canonical `id`。

### 5.4 Plugin SDK Facade

插件 SDK 对外开放 i18n 与 lexicon facade：

```ts
await context.utils.i18n.getLocale();
await context.utils.i18n.resolveText(localizedText);
context.utils.i18n.createMessage(key, params);

await context.utils.lexicon.search(query, options);
await context.utils.lexicon.resolve(id, options);
await context.utils.lexicon.register(entries, options);
```

已实现权限（`sdkapi >= 260713`）：

- `i18n.read`：读取当前 locale 与解析插件本地化文本；`createMessage()` 为不读取宿主状态的纯构造。
- `lexicon.read`：查询 official 与当前插件 scoped domain lexicon。
- `lexicon.register`：把 plugin-local id 原子投影到 `plugin:<pluginId>:` namespace；单插件 100 entries、单批 50 entries / 256 KiB。
- `catalog.read` 仍属于 Phase 5，用于读取 catalog 版本与本地可用 pack metadata。

插件 manifest 示例：

```json
{
  "name": {
    "default": "Unit Converter",
    "locales": {
      "zh-CN": "单位换算"
    }
  },
  "description": {
    "default": "Convert units quickly",
    "locales": {
      "zh-CN": "快速换算单位"
    }
  }
}
```

第三方插件只能读取 official 与自身 overlay；不能覆盖 official canonical id，也不能读取其他插件 entries。overlay 仅驻留内存并在 disable/unload 时清理；只有签名 catalog 才能在后续 Phase 5 提供全局 domain entries。

### 5.5 CatalogService

CatalogService 统一处理云端公开数据包：

```ts
interface CatalogPackManifest {
  id: string;
  type:
    | "i18n-messages"
    | "domain-lexicon"
    | "plugin-registry"
    | "capability-registry"
    | "model-registry"
    | "release-metadata";
  version: string;
  schemaVersion: number;
  minSdkApi?: number;
  localeCoverage?: AppLocale[];
  hash: string;
  signature: string;
  createdAt: string;
}
```

核心流程：

1. `checkUpdates()` 拉取 catalog manifest。
2. `downloadPack(packId)` 下载 content-addressed pack。
3. `verifySignature()` 验证官方签名与 hash。
4. `validateSchema()` 验证 schemaVersion 与 pack type。
5. `importToSQLite()` 写入本地 catalog tables。
6. `activateVersion()` 切换 active version。
7. `rollbackVersion()` 回滚到上一个 active baseline。

Catalog 数据源：

- 内置 baseline：随 app 或 packages 发布，用于离线和回滚。
- 云端 official：由 Nexus 提供签名 pack。
- plugin scoped：由插件注册，不可覆盖 official canonical id。

## 6. Data Storage

本地建议新增 catalog 相关表，具体表名可在实现期调整：

- `catalog_packs`：pack id、type、version、hash、signature、status、activatedAt。
- `catalog_entries`：entry id、pack id、type、locale coverage、payload ref、deprecated/replacedBy。
- `domain_lexicon_entries`：canonical id、domain、version、labels、aliases、metadata、source。
- `plugin_lexicon_entries`：plugin id、canonical id、domain、labels、aliases、metadata、enabled。

存储规则：

- SQLite 是运行时 SoT。
- 签名 pack 的 JSON 只作为导入来源和短期 cache，不作为运行时直接查询来源。
- private sync payload 不复用 catalog 表；sync 数据仍按密文 `payload_enc` / `payload_ref` 规则。

## 7. Migration Plan

### Phase 0 - Audit Baseline

- 扫描 CoreApp / Nexus / packages 的 `t(key, 'fallback')`、`locale === 'zh' ? ... : ...`、裸中文/英文 UI 文案。
- 分类为 UI message、transport message、domain lexicon、plugin metadata、domain data。
- 输出迁移清单，先覆盖用户可见生产路径，demo/docs 示例后置。

### Phase 1 - Locale Core

- 在 `packages/utils` 增加 locale normalize 与 short/app locale adapter。
- CoreApp、Nexus、utils resolver 改为复用同一套 normalize 逻辑。
- 禁止新增散写 `startsWith('zh')` 的 production UI 适配。

### Phase 2 - Localized Value

- 增加 `LocalizedText` / `LocalizedList` 与 resolver。
- 插件 manifest loader 支持 localized metadata，并保持旧 string manifest 兼容。
- Store、CoreBox、Plugin detail 使用 resolver 展示 localized plugin metadata。

### Phase 3 - Domain Lexicon V1（已完成，2026-07-13）

- 单位 baseline 已迁入 `unit.*` canonical ids，共 53 个 length/mass/temperature/data/time/area/volume/speed entries。
- PreviewSDK UnitConversion 与 CoreApp calculation 共用 domain lexicon-backed conversion core。
- 解析/展示已分离：所有 locale aliases 均可解析，结果按 host locale 展示；专业 symbol 保持精确大小写，`KB` 与 `Kb` 不折叠冲突。

### Phase 4 - Plugin SDK Exposure（已完成，2026-07-13）

- main `context.utils` 与 renderer exports 已暴露同构 `i18n` / `lexicon` facade，并保留纯 `createMessage()`。
- typed `plugin:i18n:*` / `plugin:lexicon:*` events 只接受 verified plugin context，执行最低 SDK 与三项 permission fail-closed。
- `lexicon.register()` 由宿主分配 namespace/provenance，执行有界原子提交、跨插件隔离和 lifecycle cleanup；插件开发文档已补完整示例。

### Phase 5 - CatalogService

- 实现内置 baseline catalog loader。
- 实现 Nexus official catalog manifest/download/verify/import/activate/rollback 流程。
- 首批 cloud pack 只建议承载 domain lexicon 与 capability/model registry，不承载用户私有数据。

### Phase 6 - Quality Gates

- locale key 双语对齐检查。
- CoreApp/Nexus 禁止新增中文 fallback 与生产双语三元表达式。
- domain lexicon locale coverage 检查。
- catalog schema/hash/signature 校验。
- 插件 manifest localized fields 至少有 `default`。

### Phase 7 - Hard-Cut

- 对高频生产路径清理 fallback 后，新增 lint/CI guard 阻止回潮。
- `$i18n:key` transport message 和 UI message catalog 保持兼容，但禁止后端新增裸用户可见文案。
- domain lexicon 成为单位、币种、时区等领域解析的唯一新入口。

## 8. Quality Constraints

- KISS：先落 locale core、localized value、unit lexicon，不一口气迁移所有文案。
- YAGNI：2.6.0 不实现翻译管理后台；catalog pack 可以先用静态签名文件和最小 API。
- DRY：CoreApp/Nexus/plugins 共用 resolver，不重复写 locale 判断。
- SOLID：UI messages、transport messages、domain lexicon、catalog service 各自单一职责。
- 安全：catalog 不可携带 secret、token、用户文件内容或私有同步数据。
- 可观测：CatalogService 必须暴露 active version、last update、signature status、rollback reason。

## 9. Acceptance Criteria

> 当前完成边界：Phase 3 单位 Domain Lexicon 与 Phase 4 Plugin SDK facade 验收已通过；下列 CatalogService 与质量门禁条目仍是后续 phase 的最终验收要求。

功能验收：

- CoreApp 与 Nexus 新增 UI 文案不再允许中文 fallback 作为生产路径。
- 单位换算支持中文/英文别名混合输入，结果按当前 locale 展示。
- 插件 manifest 可以声明 localized name/description，并在 CoreBox/Store/Plugin detail 正确展示。
- 插件可通过 SDK 读取当前 locale、解析 localized text、查询官方 lexicon。
- CatalogService 能加载内置 baseline，并能导入一个签名 domain lexicon pack 到 SQLite。

质量验收：

- locale key 对齐检查通过。
- domain lexicon coverage 检查通过。
- catalog schema/hash/signature 失败时 fail-closed，不激活损坏 pack。
- 离线状态仍可使用内置 baseline。

文档验收：

- 插件开发文档补 localized manifest 与 lexicon SDK 示例。
- Roadmap / TODO / Quality Baseline / CHANGES / INDEX 同步 2.6.0 目标与质量门禁。

## 10. Rollback / Compatibility

- 旧 string manifest 字段继续兼容，loader 将其视为 `LocalizedText.default`。
- 旧 UI message key 保持兼容，不在迁移期批量删除。
- catalog 激活失败回滚到上一个 active pack；没有 active pack 时使用内置 baseline。
- plugin-scoped lexicon 可禁用或按 plugin 卸载清理，不影响 official catalog。
- 2.6.0 迁移期间允许已存在 fallback 逐步清理，但禁止新增。

## 11. Open Decisions

- Catalog official endpoint 是否固定为 `/api/v1/catalog/*`，还是复用 Nexus store/update API 命名空间。
- 第三方插件 lexicon 是否允许被用户手动提升为 workspace scoped。
- locale coverage 首期是否只强制 `zh-CN/en-US`，还是同时预留 `ja-JP` / `ko-KR` schema 测试夹具。
- Catalog pack 是否需要 delta patch，或 2.6.0 首期只支持 whole-pack replacement。

# Provider 收敛分析

Task: `09-04-reco-source-registry` Step 0 / Step 5
勘察日期:2026-09-04

## 1. Import 环:确认存在,`await import()` 是规避手段

`item-rebuilder.ts` 的 6 处 `await import()` 中,**5 处的静态化会成环**。
用 BFS 从每个动态依赖出发,查它是否能走回 `search-engine/recommendation/`:

| 动态依赖 | 结论 | 环路径 |
|---|---|---|
| `addon/system/main-window-provider` | **成环** | → `search-engine/types` → `core/touch-app` → `modules/storage/index` → `storage/main-storage-registry` → `addon/apps/app-provider` → `search-core` → `recommendation-engine` |
| `addon/system/system-actions-provider` | **成环** | → `addon/apps/app-provider` → `search-core` → `recommendation-engine` |
| `addon/system/windows-shell-file-provider` | **成环** | 同 main-window-provider 路径 |
| `modules/plugin/plugin-module` | **成环** | → `plugin/plugin.ts` → `search-core` → `recommendation-engine` |
| `modules/plugin/adapters/plugin-features-adapter` | **成环** | → `plugin/plugin.ts` → `search-core` → `recommendation-engine` |
| `addon/apps/search-processing-service` | 无环 | 遍历 18 个文件未回到 `recommendation/` |

而 `recommendation-engine` 静态持有 `itemRebuilder` 并调用 `rebuildItems()`,
所以完整环是:

```
item-rebuilder → <provider> → … → search-core → recommendation-engine → item-rebuilder
```

### 对设计的影响

`design.md` §2.3 的「注册一律由来源推入,注册表与 rebuilder 不导入任何具体 provider」
从**建议升级为硬约束**。若反向导入,会把当前被动态导入掩盖的环变成静态环,
症状是启动期 `Cannot access '...' before initialization`(与 #524 同类)。

### 检测脚本

BFS 检测同时匹配静态 `from '...'` 与动态 `import('...')`,
正则 `/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g`,只跟随相对路径。
建议在 Step 5 把它固化成一个针对 `recommendation/` 目录的回归测试,
形式参考 `core-box/core-box-import-cycle.test.ts`(该测试**只扫 `core-box/`,不覆盖本目录**)。

## 2. 内置 vs 插件重复:一处真重复,一处误报

### 2.1 `system-actions-provider` vs `plugins/touch-system-actions` —— **不重复**

同名不同域,无功能交集:

| | 覆盖范围 |
|---|---|
| 内置 `system-actions-provider` | `dev-plugin`、`tpex-plugin`、`app-index`、`file-index`、`screenshot-cursor-display`(`:35`)—— 都是「拿到一个文件/路径后能做什么」 |
| 插件 `touch-system-actions` | 关机 / 重启 / 锁屏 / 音量 / 亮度 / 主窗口(manifest `description`)—— OS 电源与硬件控制 |

CLAUDE.md 记载的「2026-02 把 system-actions 抽成插件」指的是**电源/硬件类动作**,
内置 provider 留下的是**文件与索引类动作**,不是抽取残留。**结论:保持现状,无需下线。**

命名有误导性(两者都叫 "system actions"),但改名不属本任务范围。

### 2.2 `main-window-provider` vs 插件的 `open-main-window` —— **真重复**

| | 标识 | 关键词 |
|---|---|---|
| 内置 `main-window-provider` | `t('tray.showWindow')`(`:165`) | `MAIN_WINDOW_SEARCH_TOKENS` = ACTION(17 个) × OBJECT(24 个) + PHRASE(18 个) |
| 插件 `touch-system-actions` | `id: 'open-main-window'`, `name: '打开主窗口'`(`index.js:81-84`) | `['主窗口','打开','main window','show window','显示窗口','tuff','窗口']` |

关键证据:内置的 `MAIN_WINDOW_PHRASE_TOKENS` 中**字面包含 `'打开主窗口'`**,
正是插件那个 action 的 `name`;插件关键词 `主窗口` / `window` / `show window` / `打开`
全部落在内置的 token 集合内。

因此用户搜「主窗口」「打开主窗口」「show window」时,**两条几乎相同的结果会同时出现**。

**建议**:保留内置 `main-window-provider`(token 覆盖远更完整,且是宿主自身能力,
不应依赖插件安装状态),从插件移除 `open-main-window` action。
该改动属于插件侧,**不在本任务范围**,应另提任务。

## 3. 文件搜索五 Provider 的职责混装

`search-core.ts:334-343`:

```ts
// Native providers provide fast first-frame candidates; file-provider remains the index/enrichment layer.
if (process.platform === 'win32') {
  this.registerProvider(windowsShellFileProvider)
  this.registerProvider(everythingProvider)
} else if (process.platform === 'darwin') {
  this.registerProvider(macSpotlightFileProvider)
} else if (process.platform === 'linux') {
  this.registerProvider(linuxNativeFileProvider)
}
this.registerProvider(fileProvider)
```

同一注册表里混着两类职责:

- **快路径**(native,出首帧):`windowsShellFileProvider`、`everythingProvider`、
  `macSpotlightFileProvider`、`linuxNativeFileProvider`
- **索引路径**(enrichment):`fileProvider`

两者的结果在推荐侧靠 `item-rebuilder.normalizeSourceId()` 的别名表**事后合并**为
`file-provider`。也就是说:「它们其实是同一个逻辑来源的不同实现」这件事,
只在 rebuilder 内部一张硬编码表里表达过一次,注册表本身不知道。

### 与本任务的关系

C1 的注册表把这张别名表从 rebuilder 移到 provider 自声明
(`recommendationSourceAliases`),等于**让「同一逻辑来源」成为一等概念**。
这本身就是这条分析的落地部分。

### 未落地的进一步收敛(留作后续)

`ISearchProvider.priority?: 'fast' | 'deferred'`(`tuff-dsl.ts:1611`)已存在,
语义正好对应「快路径 / 索引路径」。但**当前是否已用该字段表达这层语义未经实测确认**。
若已用,则职责区分在类型上已存在,只是注册表未据此分组;
若未用,把 4 个 native provider 标为 `fast`、`fileProvider` 标为 `deferred`
是一次低风险的语义显式化。

两条都不在 C1 范围内,建议后续单独提任务,避免与推荐重构耦合。

## 4. Provider 数量的实际结论

父任务原始诉求称「第一层接入的 Provider 有点太多了」。实测 8 个查询侧 provider:

`mainWindow` / `systemActions` / `contextActions` / `app` /
`[windowsShell + everything | macSpotlight | linuxNative]` / `file` /
`pluginFeatures` / `preview`

**数量本身不是问题** —— 单平台实际激活 6~7 个,且各自职责不同。
真正的问题是 §3 的职责混装(5 个文件 provider 表达的是同一个逻辑来源)
和 §2.2 的一处功能重复。收敛这两处之后,注册表规模是合理的。

## 5. 迁移过程中发现的既有缺陷:clipboard 推荐项 id 形状不匹配

**发现于 Step 4b,未修复(不在本任务范围),需另提任务。**

`mergeAndEnrichItems` 用两把 key 把重建出的 item 匹配回打分候选:

```ts
scoreMap.set(s.itemId, s)
scoreMap.set(`${s.sourceId}:${s.itemId}`, s)
```

而 clipboard 来源产出的 item id 是 `clipboard-${record.id}`,存储的候选 `itemId`
则是裸数字(旧实现 `Number.parseInt(item.itemId, 10)` 即为证)。两把 key 都匹配不上:

- `clipboard-history:clipboard-42` —— miss
- `clipboard-42` —— miss
- `findScoredByPartialMatch` 只有 plugin / app 两个分支,**没有 clipboard 分支** —— miss

结果:clipboard 推荐项重建出来后会被 `mergeAndEnrichItems` **静默丢弃**。

### 为什么一直没被发现

全仓没有任何位置写入 `sourceId: 'clipboard-history'` 的 `item_usage_stats` 行,
因此 clipboard 候选从未真正进入过推荐池,这条分支在生产中不可达。

### 修复选项(留给后续任务判断)

1. 让 clipboard 来源产出 `id = record.id`(与存储形态一致),但会改变 item id 的对外形状;
2. 给 `findScoredByPartialMatch` 加 clipboard 分支;
3. 更一般地:把「候选 id ↔ item id」的映射也纳入来源自声明的能力
   —— 这同时能解掉 §6 的残留问题。

## 6. 本任务的遗留:`findScoredByPartialMatch` 仍含 provider 名

重构后 `item-rebuilder.ts` 由 674 行降到 345 行,**fan-out、别名表、DB 查询三者全部消失**。
但文件内仍有具体来源名,集中在两处:

- `findScoredByPartialMatch()` —— `'plugin-features'` / `'app-provider'` / `'application'`
  三个分支的身份匹配启发式;
- `rebuildPluginRecommendItems()` —— `'__builtin_clipboard_url__'` 特例(归 C3)。

这两处属于 **merge/enrich(身份匹配)** 层,而非 **rebuild(重建派发)** 层,
PRD 的范围是后者。因此本任务的验收标准应读作:
「重建派发路径不含来源知识」,而不是「整个文件不含来源名」。

`findScoredByPartialMatch` 的下沉是自然的后续:若把「一个来源认哪些 id 形态为同一条目」
也做成来源自声明的能力,§5 的 clipboard 缺陷会一并消失,
新来源也能自带身份匹配规则而不必改这个文件。

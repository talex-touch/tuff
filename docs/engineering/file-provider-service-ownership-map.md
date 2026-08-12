# FileProvider 服务归属图

> 2026-08-07 实测，服务于 [#343](https://github.com/talex-touch/tuff/issues/343)。
> 该 issue 要求「移动代码前先画出依赖/归属图」，且明确「目标不是任意削减行数」。本文档因此按**是否承载策略**判定，而非按大小。

## 先纠正三个数字

| 对象 | issue 记录 | 实测 | |
|---|--:|--:|---|
| `apps/.../apps/app-provider.ts` | ~4,223 | **4,579** | +8% |
| `apps/.../files/file-provider.ts` | ~3,604 | **4,298** | **+19%** |
| `files/services/` 非测试文件 | — | **35 个 / 5,654 行** | |

两个 composition root 在 issue 挂起期间都还在长。

## ⚠️ 「10 个不足 60 行」**不等于**「10 个可删适配器」

35 个 service 里有 10 个不足 60 行。但逐个读下来，**只有 1 个**符合 issue 说的「单方法适配器、不带策略」：

| 文件 | 行数 | 判定 |
|---|--:|---|
| `file-provider-index-persist-entry-mapper-service.ts` | 12 | **纯转发**：唯一方法体是 `return this.mapper.map(entries)`，无策略、无测试缝、无归属价值。符合 issue 描述。 |
| `file-provider-progress-estimator-service.ts` | 15 | **保留**：`extends` 共享类并注入文件域策略 `terminalStages: ['idle','completed']` / `completedStages: ['completed']`。 |
| `file-provider-path-service.ts` | 22 | **保留**：新增 `resolveIndexedWatchPathPlatform`，把 `NodeJS.Platform` 收窄到 `IndexedWatchPathPlatform` 并回退 `'linux'`——这是真实的适配决策。 |
| `file-provider-icon-cache-service.ts` | 26 | **保留**：定义域常量 `FILE_ICON_META_EXTENSION_KEY` 与域类型 `FileIconCacheMeta`。 |
| `file-provider-write-side-effect-service.ts` | 34 | **保留**：在共享 service 之上定义文件域的 options/deps 类型。 |

**只按大小裁剪会删掉两个承载真实策略的文件。**

## 符合验收条 7 的两处「本地再导出层」

issue 要求「文档/import 搜索应导向规范实现，而非影子文件」。有两处把共享符号换名再导出：

| 本地名 | 规范名 | 本地引用 : 规范引用 |
|---|---|--:|
| `WORKER_STATUS_SNAPSHOT_CACHE_TTL_MS` | `INDEXED_WORKER_STATUS_SNAPSHOT_CACHE_TTL_MS` | 2 : 2 |
| `summarizeWorkerStatus` | `summarizeIndexedWorkerStatus` | 1 : 2 |
| `FILE_PROVIDER_PROGRESS_STREAM_DEFAULT_CONFIG` | `INDEXING_PROGRESS_STREAM_DEFAULT_CONFIG` | 3 : 5 |

两个名字都活着、且引用数相当——**搜索任一名字都只能看到一半的调用点**，这正是验收条 7 说的那种影子。涉及 `file-provider-worker-status-service.ts`（34 行）与 `file-provider-progress-stream-service.ts`（50 行）。

## 建议次序

1. 删 `file-provider-index-persist-entry-mapper-service.ts`，`file-provider.ts` 三处引用（L168 / L560 / L959）直接改用 `IndexedWorkerPersistEntryMapperService`。唯一确定无副作用的一处。
2. 收敛那两处再导出别名，让搜索只有一个答案。
3. 其余 33 个 service 的去留需要读代码判断，不能按大小裁——本文档只对最小的 5 个给出了判定。

## 未做

`app-provider.ts`（4,579 行）没有做同等勘察；它没有对应的 `services/` 目录，形态与 FileProvider 不同，需要单独的成分分析。

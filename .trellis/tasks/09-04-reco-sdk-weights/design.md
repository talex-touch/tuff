# Design — 推荐 SDK 与权重函数开放

Parent: `.trellis/tasks/09-04-corebox-recommend-platform`

## 1. 核心设计问题

插件条目**结构性地**没有 usageStats —— 宿主不掌握插件内部行为。
这不是缺陷,是边界事实。当前实现的应对是「短路评分,给扁平 priority」,
结果是插件条目既不随时间变化也不随使用变化。

两个显而易见的替代方案都是坏的:

| 方案 | 失败模式 |
|---|---|
| 缺失维度补 0 | 插件条目在频率/最近使用维度恒定垫底 → 与现状同样不可用 |
| 缺失维度给默认高分 | 插件可通过多推条目挤占推荐位 → 变成滥用面 |

## 2. 方案:维度归一化 + 宿主侧用量回流 + 名额上限

三者缺一不可,分别解决「冷启动公平」「长期真实性」「防滥用」。

### 2.1 维度归一化(解决冷启动)

不按「缺失即 0」,而是**只在候选实际具备数据的维度上评分,再按参与维度的权重和归一**:

```
现状(隐式全维度):
  score = time×1e5 + frequency×1e4 + recency×1e3 + novelty + semantic
  插件候选 → 短路,拿不到任何一项

改为:
  participating = 该候选有数据的维度集合
  score = Σ(dimension_score × weight) / Σ(weight over participating)
```

效果:一个只有时间信号的插件候选,与一个只有时间信号的内置候选**可比**;
而一个具备全维度的高频内置应用仍然赢 —— 因为它在每个维度上都拿到了真实高分,
不是靠维度数量取胜。

**必须验证的边界**:归一化会放大稀疏候选的单维度分数。
需要测试确认「只有一个中等时间分的插件条目」不会压过「频率极高的内置应用」。
若压过了,说明归一化系数需要引入维度覆盖度惩罚。

### 2.2 宿主侧用量回流(解决长期真实性)

宿主本来就路由推荐条目的执行 —— 用户点击插件推荐项时,执行经过宿主。
因此宿主可以按 `sourceId:itemId` 记录真实 usageStats,与内置来源同构。

```
首次出现  → 无 usageStats,走 §2.1 归一化(仅 priority + time 维度)
被执行后  → 有真实 executeCount / lastExecuted → 进入完整 frecency
```

这也满足 PRD 的 A4。注意这与 `recommendation-freshness-contracts.md` 的 novelty 交接同构:
「首次执行把排名交还给 frecency」。插件条目走同一条路,不是特例。

### 2.3 `priority` 降级为**来源内排序**(防滥用)

插件声明的 `priority` **不再作为跨来源分数**,只用于该插件自己候选之间的排序。
理由:跨来源使用插件自报的数字,等于让插件自己定自己的全局排名 ——
任何插件设 `priority: 100` 就能置顶。

跨来源竞争由 §2.1 的真实维度决定。

### 2.4 名额上限

单个插件在一次推荐中的候选数、以及全部插件合计的候选数,各设上限。
上限的具体数字与是否可配置在实现时定,但**上限必须存在** ——
否则 §2.1 的归一化会被「大量稀疏候选」摊薄内置条目的相对位置。

## 3. 权重函数 SDK

### 3.1 暴露什么

现有纯函数在 `recommendation-utils.ts`,已是导出:

```ts
calculateTimeContextBoost(...)
calculateHourAffinity(...)
calculateTimeRelevanceScore(...)   // = (slot×0.5 + hour×0.5) × boost
// 常量:TIME_CONTEXT_SLOT_BOOST / TIME_CONTEXT_DAY_BOOST /
//       TIME_RELEVANCE_SLOT_WEIGHT / TIME_RELEVANCE_HOUR_WEIGHT
```

它们是纯函数、无 IO、无用户数据引用 → 上移 `packages/utils` 安全。

**frecency 主评分不在本设计的暴露范围内**(见 Q4)。理由:
它耦合 usageStats 的内部形状,暴露它等于把「用量数据结构」也变成公开契约,
后续任何调参都成为破坏性变更。若用户坚持暴露,应暴露为
「传入归一化后的数值、返回分数」的纯函数,而非直接吃 usageStats 结构。

### 3.2 隐私断言

- 暴露的全部是纯函数:输入由调用方提供,函数内不读取任何用户数据。
- 静态测试:`packages/utils` 中这些函数的实现不 import 任何 db / storage / usageStats 类型。
- 插件调用权重函数**不产生**对宿主的数据请求。

### 3.3 版本门槛

新 SDK 面需 sdkapi 门槛(参考 `system.resolveApplication` 用 `sdkapi >= 260817` 的既有做法)。

## 4. 新索引文件进入推荐

### 4.1 为什么不能用缓存失效

```ts
// search-core.ts:483 —— 当前只对 App 生效,注释写明了理由
if (payload.providerIds.includes(APP_INDEXED_SOURCE_ID)) {
  this.recommendationEngine?.invalidateCache()
}
```

索引构建期 file commit 连续触发。把 file source 加进这个条件 →
`invalidateCache()` 被高频重入,30 分钟缓存等于不存在,
且 `recommendation-freshness-contracts.md` 的「同步读屏障 + generation counter」
会被反复冲刷(一个在失效前开始的 recommend() 可能不写回任何层)。

### 4.2 改用增量追加

```
新文件索引提交
   │
   ├─ ❌ 不调用 invalidateCache()
   │
   └─ ✅ 经准入规则筛选 → 推送到 C2 的增量追加入口
            │
            └─ 有打开的空态会话 → update chunk;无会话 → 丢弃
```

缓存失效仍**只保留给 App 这类低频事件**,现有契约不动。

### 4.3 准入规则(必须有,否则严重回归)

文件索引动辄数万条。没有准入规则,推荐区会被文件淹没。规则至少包含:

- **来源限定**:只接受用户高频目录(桌面 / 下载 / 文档等),不接受全盘扫描结果
- **类型限定**:优先图片等资源类;排除临时文件、缓存、构建产物
- **数量上限**:单次追加与单会话累计各设上限
- **节流**:索引构建期的批量提交需合并,不是逐条推送

规则归属见 Q6(宿主写死 / 用户设置 / 插件声明)—— 设计 review 时定。

### 4.4 图片资源

图标与缩略图走 `tfile` 描述符(C2 的控制面),IPC 中只有 URL,无字节。
这是 `native-resource-protocols.md` 的硬约束,不因推荐场景放宽。

## 5. 兼容性

- `PluginRecommendCandidate` 的 `priority` 字段保留,语义变更需在 SDK 文档中写明
  (从「全局优先级」变为「来源内排序」)。这是**行为破坏性变更**,需 sdkapi 门槛区分新旧行为。
- 若为插件条目引入新 `recommendation.source` 取值,**三个文件必须同步**:
  `core-box/recommendation.ts`、`core-box/tuff/tuff-dsl.ts`、`transport/events/types/core-box.ts`。
  按 `recommendation-freshness-contracts.md`,漏改在消费者穷尽检查前不可见。

## 6. 测试策略

| 层 | 断言 |
|---|---|
| 归一化公平性 | 稀疏插件候选 vs 高频内置应用 → 内置应胜;同维度覆盖度下两者可比 |
| 用量回流 | 插件条目执行前后排名变化,与内置条目的 frecency 曲线同构 |
| priority 降级 | 插件把全部候选设 `priority: 100` **不能**改变其跨来源位置 |
| 名额上限 | 插件推 N≫上限 个候选 → 被截断,内置条目位置不受影响 |
| 权重 SDK | 公开签名稳定;静态断言无 db/storage import;sdkapi 门槛生效 |
| 失效风暴 | 索引 N 个文件期间 `invalidateCache()` 调用次数**不随 N 增长** |
| 文件准入 | 排除目录/类型的文件不进推荐;超上限被截断 |
| 资源边界 | 图片条目的 IPC payload 无 `Buffer`/base64/字节字段 |
| 特例清理 | grep 确认无 `__builtin_clipboard_url__` 残留分支 |

## 7. 开放问题(需用户拍板)

- **Q4**:权重函数暴露边界 —— 本设计建议**只暴露时间类纯函数**,
  frecency 主评分不暴露(理由见 §3.1)。需用户确认或推翻。
- **Q5**:插件条目 usageStats 回流是否需要用户可见的隐私说明。
- **Q6**:文件准入规则的归属(宿主写死 / 用户设置 / 插件声明)。

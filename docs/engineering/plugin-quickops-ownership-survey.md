# Plugin / QuickOps 归属勘察

> 2026-08-07 实测，服务于 [#339](https://github.com/talex-touch/tuff/issues/339)。
> 该 issue 自述「问题不是行数本身」，所以本文档按**成分**而非行数给出可执行的拆分依据。

## 先纠正两个数字

| 文件 | issue 记录 | 实测 | 差异 |
|---|--:|--:|---|
| `modules/plugin/plugin.ts` | ~3,060 | **4,013** | **+31%**，issue 挂起期间仍在增长 |
| `modules/quick-ops/index.ts` | ~2,999 | 2,999 | 未变 |

## 两个文件的形态**不一样**，不该套同一套拆法

### `plugin.ts` —— 确实是一个巨类

`TouchPlugin` 占 **3,532 / 4,013 行（88%）**，**163 个成员**。按 issue 提的五类归属：

| 归属 | 成员数 | 占比 |
|---|--:|--:|
| feature/result projection | 29 | 18% |
| activation/lifecycle | 27 | 17% |
| **capability factory 样板** | **18** | **11%** |
| permission/capability dispatch | 18 | 11% |
| transport/channel | 7 | 4% |
| diagnostics/audit | 6 | 4% |
| 未归类 | 58 | 36% |

**一个具体、机械、可先摘的部分**：18 个 `*CapabilityFactory` 成员是同一模式的重复——每种能力一个 `private static _xCapabilityFactory` 字段加一个 `static setXCapabilityFactory()` setter（snipaste / systemAction / browserOpen / browserData / translation / intelligenceContext / windowManager / windowPreset / workspaceScript…）。这是**一张静态注册表被手写了 N 遍**，不是混合归属，可以在动真正的五类拆分之前先收敛掉。

### `quick-ops/index.ts` —— **不是**巨类

`QuickOpsModule` 占 2,147 行，但**只有 69 个成员**。文件其余约 850 行是模块级的 `FlowTarget` 描述符与常量（`QUICK_OPS_CAPABILITIES_FLOW_TARGET` 等声明式对象）。

**注意一个容易得出的错误结论**：按 2 空格缩进抓「成员」会把对象字面量的键（`id` / `name` / `description` / `supportedTypes`）一并算进来，得出 390 个成员的假象——比真实值高 5.6 倍。我第一次跑就是这个结果。

所以 #339 对这两个文件的描述并不同等成立：`plugin.ts` 是「一个类混了太多归属」，`quick-ops/index.ts` 更接近「一个中等大小的模块 + 一大块声明式数据」。**对后者做五路服务拆分，收益远低于对前者。**

## 建议次序

1. 先收敛 `plugin.ts` 的 18 个 capability factory 样板（机械、低风险、独立可验证）。
2. 再按 activation/lifecycle 与 feature/result projection 两块（合计 35%）拆 `TouchPlugin`——它们是成员最多且边界最清楚的两类。
3. `quick-ops/index.ts` 优先考虑把约 850 行 `FlowTarget` 描述符移出主文件，而不是拆服务；拆服务的收益要在描述符移出后重新评估。

## 未做

未归类的 58 个 `TouchPlugin` 成员需要逐个读代码判断归属——按名字启发式归类到此为止，再往下推就会变成猜测。

# 设计：聊天 widget 的纯前端沙箱（arrow-js）

父任务：`08-09-home-panel-layering-v2` ｜ PRD：`./prd.md` ｜ 实验：`./research/iframe-isolation-result.md`

## 范围（用户 2026-08-09 定）

- **聊天 widget**：只有 arrow-js 一种运行时，跑在新的隔离沙箱里。
- **插件 widget**：`vue` / `webcomponent` / `arrow` 三条运行时**原样保留**，同 realm 代理沙箱不动。仓库里现存 7 个插件 widget 全是 `.vue`，一个都不受影响。

这是**新增一条路**，不是替换。

## 架构

```
渲染进程（应用文档）
 └─ ToolWidgetCard.vue                宿主：iframe 生命周期、高度、错误降级、来源标识
     └─ <iframe sandbox="allow-scripts" srcdoc=…>   不透明源 → 独立进程
          ├─ <meta CSP>  （head 第一个元素）
          ├─ arrow-js（宿主内联，固定版本）
          └─ 模型写的 widget 源码
```

没有 Worker 层。原因见实验：不透明源 sandbox iframe 在 Electron 41 里被隔离到独立进程，死循环冻不住应用（父线程 200/200 tick）。而 arrow-js 必须操作 DOM，放进 Worker 就用不了。实验同时确认普通同源 iframe **会**冻住父线程（1/200 tick）—— 隔离来自 `sandbox` 属性，不是 iframe 本身。

## 为什么不复用同 realm 那套沙箱

上一版方案曾打算"隔离层另起、策略层全复用"。真读完之后要修正一点：`widget-sandbox-policy.ts` 的主体是**在同一 realm 里伪造浏览器 API**（代理 window/document、命名空间化 localStorage/IndexedDB/BroadcastChannel/CacheStorage、拦截导航）。在不透明源 iframe 里这些**本来就是真隔离的** —— 再套一层代理是纯粹的多余。

真正能复用的是这些，且大多在阶段 2/3 才兑现：

| 复用项 | 阶段 |
|---|---|
| `WIDGET_SANDBOX_SOURCE_MAX_CHARS`（1MB 源码上限） | 1 |
| `WidgetSandboxEvidence` 证据形状（源哈希、runtime、阶段） | 1 |
| `assertWidgetDynamicSource` 静态扫描，作为**纵深防御**而非边界 | 1 |
| `WidgetSandboxOperation` 能力枚举 + 配额 + 审计日志 | 3 |

静态扫描留着的理由：它拦得住直白的 `eval(` / `Function(` / `({}).constructor`，成本为零。但它**不是边界** —— 已实测 `Object['con'+'structor'](…)`、`[...].join('')`、`String.fromCharCode(…)` 三种拼接全部绕过（探针见提交记录）。边界是不透明源。

## CSP

srcdoc 文档**继承父文档的 CSP**，而应用的父 CSP 几乎不设防（`apps/core-app/src/renderer/index.html:8`：`default-src *`、`script-src * 'unsafe-inline' 'unsafe-eval'`）。CSP 是收紧型叠加，所以自带一份即可生效：

```
default-src 'none';
script-src 'unsafe-inline';
style-src 'unsafe-inline';
img-src data: blob:;
connect-src 'none';
```

- `connect-src 'none'` 是最关键一条：关掉网络出口，模型代码无法把对话内容外传。
- meta 形式必须是 `<head>` 第一个元素。骨架由宿主拼装、模型内容只进 `<body>` 之后的脚本块，由构造方式保证。
- meta CSP 表达不了 `frame-ancestors` / `report-uri` / `sandbox`；这三个都不需要（sandbox 由属性给，frame-ancestors 由不透明源解决）。

## srcdoc 拼装是信任根

整套隔离的强度取决于**模型内容不能提前闭合骨架**。模型源码作为 JS 字符串注入，唯一的逃逸面是 `</script>`（HTML 解析器不看 JS 语法，见到 `</script` 就闭合当前脚本块）。

对策：注入前把源码里的 `</` 全部转义成 `<\/`。这在 JS 里语义完全等价（`\/` 就是 `/`），但 HTML 解析器再也见不到脚本结束标记。同理转义 `<!--`。

**这一条必须有单测**，且要覆盖模型源码里写 `'</script>'`、`"</SCRIPT >"`、`</style>` 的情况。这是整个方案唯一一处"写错一个字符就全塌"的地方。

## 通信契约

全部 `postMessage`，宿主侧校验 `event.source === iframe.contentWindow`。**不能拿 `event.origin` 当身份** —— 不透明源的 origin 是字符串 `"null"`，谁都能伪造。

```
宿主 → 沙箱   { type: 'tuff:widget:init', props }
沙箱 → 宿主   { type: 'tuff:widget:ready' }
沙箱 → 宿主   { type: 'tuff:widget:height', px }
沙箱 → 宿主   { type: 'tuff:widget:error', message }
```

高度由宿主 clamp（下限 48、上限 640，超出内部滚动），不许模型撑满窗口。

## 兜底

| 情况 | 处理 |
|---|---|
| 初始化超时（默认 4s 无 `ready`） | 拆掉 iframe，降级显示原始工具输出 |
| 运行时抛错 | `error` 消息 → 宿主显示错误态 |
| 死循环 | 进程隔离已挡住外溢；watchdog 负责让用户能把它拆掉 |
| CSP 违规 | 沙箱内 `securitypolicyviolation` → `error` 消息，可观测而非静默 |
| 高度异常 | clamp |

## 传输与持久化

复用 chart/form 的形状：`WIDGET_RESULT_PREFIX = 'tuff:widget:'`，随普通 tool-result 回渲染进程，存进会话，重载即重放。主进程只做长度与非空校验 —— 它不可能"校验"任意 JS 的安全性，装作能校验才危险。

风险等级 `read`：碰不到机器，也出不了网。

## 这个方案挡不住什么

1. **CPU**。隔离限制了爆炸半径，限制不了那个进程吃满一个核。
2. **视觉欺骗**。沙箱内能画假的登录框、假的系统提示。所以宿主必须给一个**恒定可见、沙箱无法覆盖的来源标识**（在 iframe 外面，不在里面）。
3. **模型本身就是数据出口**。挡住了 widget 的网络，挡不住模型把读到的东西写进下一段回复。这是 agent 的问题，不是 widget 的。
4. **进程隔离是运行时行为，不是规范保证**。升级 Electron 大版本后要重跑实验。
5. **拼装代码是信任根**。它的任何字符串处理 bug 都可能让 CSP 或脚本边界失效。

## 分阶段

| 阶段 | 内容 |
|---|---|
| **1（本轮）** | 只读渲染：工具 + 拼装 + CSP + iframe 宿主 + 高度协商 + 来源标识 + watchdog。**不给任何宿主能力** |
| 2 | 交互：沙箱事件回传给模型（form 提交的通用版） |
| 3 | 能力：沙箱请求宿主做事，接 `WidgetSandboxOperation` + 配额 + 审计，与 `agentTools` 权限三档对齐 |

阶段 3 单独评审 —— 那一步才真正扩大攻击面。

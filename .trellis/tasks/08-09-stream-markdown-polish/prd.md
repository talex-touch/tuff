# 流式 Markdown 渲染细化

## Goal

对齐 DEEIX-Chat（Streamdown + KaTeX + Mermaid + Shiki）那一档的内容渲染细腻度。参考项目：`https://github.com/DEEIX-AI/DEEIX-Chat`。

## 测量到的差距（不是感觉，是实跑 marked 得到的）

| 输入（流到一半） | 改前渲染成 |
|---|---|
| `**bold` | `**bold` |
| `` `code `` | `` `code `` |
| `[link](htt` | `[link](htt` |
| `$E=mc^2$` | `$E=mc^2$`（全仓库无 KaTeX） |
| `\| a \| b \|` + 半行分隔 | 一片竖线 |

已有的部分并不弱：marked + gfm、Shiki、Mermaid、DOMPurify（带「消毒器未就绪则不渲染」门禁），且 `use-block-stream.ts` 已经处理了**未闭合围栏**与**引用式链接定义迟到导致前文重渲**。所以是补洞，不是重写。

## 范围（用户 2026-08-09 选定全部四项）

1. **流式行内防闪** — 推测性闭合未终止的行内构造
2. **数学（KaTeX）** — `$…$` / `$$…$$`，且要处理流式期间未闭合的 `$`
3. **表格体验** — 流式期间不露竖线；落定后横向滚动、表头吸顶、复制为 CSV
4. **链接 / 图片硬化** — 外链走系统浏览器 + `rel=noopener`；图片限制来源与尺寸

## 进度

### ✅ 1. 流式行内防闪（已完成）

`packages/tuffex/packages/components/src/stream-markdown/src/complete-inline-markup.ts`

- 覆盖 `` ` ``（含多反引号）、`**`/`*`、`__`/`_`、`~~`、`[text` 与 `[text](url`
- **只在末尾推测**：文档中段未闭合的 `*` 是作者故意写的字面量（`2 * 3 * 4`），改写它就是篡改
- 不碰围栏代码块与行内代码里的内容
- 空行重置状态（强调不能跨段落）
- 反斜杠转义的分隔符跳过
- 超过 3 的符号串按分隔线 / ASCII art 处理，不当强调
- 未闭合围栏**原样返回** —— 那是 block stream 的职责，在这里闭合会提前结束代码块
- 仅在 `streaming` 为真时启用；已定型的文本一个字都不动

测试：纯函数 26 条 + 组件级 3 条。两处正控都做过 —— 函数改成恒等式 13 条变红（「不该动」那 13 条仍绿）；组件接线拆掉恰好 2 条流式测试变红。

验证：tuffex `vue-tsc` 0 / eslint 0 / 79 条测试全绿；下游 CoreApp `typecheck:web` 0；新模块单独在 `--noUncheckedIndexedAccess` 下编译通过（Nexus 用这个标志）。

### ✅ 2. 数学（KaTeX）（已完成）

`packages/tuffex/packages/components/src/stream-markdown/src/math-extension.ts`

- `marked` 扩展：块级 `$$…$$` + 行内 `$…$`；块级先注册，否则 `$$` 会被行内规则当空 span 吃掉
- `throwOnError: false` —— 一条坏公式不能带垮整段回复
- **`$` 判别是这个功能唯一的风险面**，单独导出 `looksLikeInlineMath` 以便直接测：分隔符必须紧贴内容、行内数学不能跨行、纯数字（`5` / `1.50`）判为货币、超长片段直接拒绝
- 取舍写在源码注释里：**宁可漏渲也不能吞正文**。漏渲是小失望，把 `$5 到 $9` 之间的文字吃进公式是屏幕上的数据损失

**依赖**：katex 之前只是 mermaid 的传递依赖，仓库开了 `shamefully-hoist=true` 所以"能用" —— 已在 tuffex 与 core-app 两处显式声明。`pnpm install` 想清空整个 node_modules 重装（`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`），没有强推，改用 `--lockfile-only`，锁文件只 +9 行、node_modules 未动。

**字体链路（构建才发现的真 bug）**：最初把 `@use 'katex/dist/katex.min.css'` 写在 tuffex 的 SFC 里，结果 tuffex 库构建把字体 URL 内联成绝对路径 `/assets/KaTeX_*` 却**一个字体文件都不发射**（tuffex dist 与 app dist 均为 0 个）—— 公式会全部用回退字体渲染，而 KaTeX 依赖自有字体度量，看着就是坏的。改为宿主应用引入（也是 KaTeX 官方推荐做法），并重建 tuffex 清掉旧产物里的绝对引用。终态：0 条未解析警告、0 个 `/assets/KaTeX` 绝对引用、59 个字体正确发射。

测试：20 条（含真实 DOMPurify 集成 3 条 —— 其余测试把 DOMPurify mock 掉了，测不出"KaTeX 定位用的行内 style 被剥掉"这种"渲染了但是乱的"故障）。正控：放宽 `looksLikeInlineMath` 后 8 条变红。

### 🟡 3. 表格体验（流式 + 版式已完成，复制 CSV 未做）

`completeTable`（与防闪同模块）+ `TxStreamMarkdown.vue` 样式。

- 分隔行未到之前，marked 把表头当成一段竖线文本 —— 宽表会有好几秒的 `| a | b | c |`，是这批里最难看的一种闪。合成一行分隔行，表头立刻按表头渲染，数据行随后落位。
- 两种到达顺序都覆盖：只有表头（追加分隔行）、数据行先于分隔行到达（把分隔行**插进**两者之间）。
- 只处理**末尾那一段**连续竖线行；上方已定型的表格与正文不碰。
- 已有分隔行（含 `:---` 对齐写法）直接返回。
- 版式：表格自己横向滚动（`display: block` —— `table` 显示模式不会溢出，只会把容器撑宽），表头 `position: sticky`。

**未做：复制为 CSV。** 它需要在表格上挂一个 hover 浮出的按钮，是组件级新增，不是样式；单独排。

### ✅ 4. 链接 / 图片硬化（已完成）

`packages/tuffex/packages/components/src/stream-markdown/src/harden-html.ts`

先查清了现状，结论与最初的假设不同：

- 主进程 `will-navigate` 已经拦截导航并转交系统浏览器，且 `validateExternalUrl` 卡死协议白名单（`http/https/mailto/tel/tuff`，`file:`/`javascript:` 一律拒）。
- DOMPurify **默认就剥掉 `target`**，所以"新开 Electron 窗口"这条路本来走不通（主窗口确实没有 `setWindowOpenHandler`，只有插件窗口有）。

所以链接侧的核心安全**本来就在**，剩下的是纵深防御与图片：

- 链接加 `rel="noopener noreferrer"`
- 图片加 `loading="lazy"`（**这是缓解手段不是性能优化** —— 屏幕外的图片根本不发请求，也就不会 beacon）、`referrerpolicy="no-referrer"`、`decoding="async"`，并保证 `alt` 恒存在

**转义不对称（实测得出，不是假设）**：marked 把 `title` 和链接文本 / 图片 alt **已转义**地交过来，`href` 却是生的。所以只有 href 走 `escapeHref`，其余原样 —— 再转一次会让读者看到 `&amp;quot;`。这条从两侧都写了断言，防止将来"简化成一条路径"。

### ✅ 4b. 远程图片拦截（用户 2026-08-09 拍板：默认开启 + 可快速放行）

`remote-image-policy.ts` + `harden-html.ts` 占位符 + `TxStreamMarkdown` 委托监听。

- **默认拦截**远程 `http(s)` 图源。`data:` / `blob:` / `tfile:` / 相对路径自带字节或在应用内解析，不拦（拦了纯属摩擦）。
- 占位符给两条出路：**加载这张**（单 src）、**本次会话允许**（全放行），并**完整显示 alt 与源地址** —— 读者要判断该不该 fetch，凭据就是这两样。
- 状态放在**模块级**而不是组件级：一次对话里每条消息各渲染一个 `TxStreamMarkdown`，组件级状态会让第四条消息上的决定在第五条上再问一遍。
- **换会话即清空**（`HomePage` watch `conversationId`）：授权是针对一次对话给的，带进下一个线程等于在读者不知情的情况下扩大它。
- 占位符走 `v-html`，Vue 绑不上事件 → 在 `markdown-body` 上挂一个**委托监听**读 data 属性。
- 渲染结果是缓存的 HTML 字符串，策略变化本身不会让任何东西重渲 → `remoteImagePolicyVersion` 变化时 `stream.reset()` 重喂。
- 文案按 tuffex 无 i18n 的约定走 props（默认英文），中文由 CoreApp 传（`home.image.*`）。

测试：拦截相关 12 条 + 组件级 3 条（含**点击放行的端到端路径** —— 它同时证明了委托监听与缓存失效，二者从策略模块本身都观测不到）。正控：把缓存失效那段 `return` 掉，恰好点击放行那条变红。

## Acceptance Criteria

- [x] 流式期间 `**` / `` ` `` / `[]()` 不再以原始符号示人
- [x] 已定型文本中真实存在的 `**` 仍按字面量渲染
- [x] 围栏与行内代码内容不被改写
- [ ] `$…$` 与 `$$…$$` 渲染为公式，且误判率可接受
- [ ] 表格流式期间不露竖线
- [ ] 外链带 `rel=noopener` 且走系统浏览器
- [ ] tuffex + CoreApp 两侧 lint / typecheck 干净（第 1 项已达成，后续项收尾时重跑）

## Notes

- 改 tuffex 源码必须跑下游 CoreApp 的 typecheck：tuffex 自己的 vue-tsc 比两个下游都宽松。
- Nexus 的 `nuxt typecheck` 本轮未跑（成本高）；改动为纯新增且新模块已单独通过 `noUncheckedIndexedAccess`。

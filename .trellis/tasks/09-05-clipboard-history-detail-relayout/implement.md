# 集成计划

## 执行状态（2026-09-05）

分支 `feature/clipboard-layout-shell`，6 个提交。测试 **39 → 112**，typecheck 0，eslint exit 0。

| 子任务 | 状态 | 提交 |
| --- | --- | --- |
| C1 版式骨架 | ✅ 已实现 | `b887d59fe` `2cecff0f3` |
| C2 分类器与洞察路由 | ✅ 已实现 | `e4dc92995` `a4f917ee7` |
| C3 颜色能力 | ✅ 已实现 | `d6355bedb` |
| C4 更多信息折叠区 | ✅ 已实现 | `09c92a25f` |
| C5 文件预览 | 📋 设计完成，实现另起分支 | `c528284bc` |
| C6 记录分享 | 📋 设计完成，等排期 | — |

### 只能在真机验证的三项

jsdom 不做布局、不加载图片、没有 canvas，以下必须 `pnpm core:dev` 后人工核：

1. **分类条 10 项在 720 宽下的实际渲染宽度**（设计稿测得 chips 566 + 计数 38，余量约 76px）
2. **`window.open` 在插件 webview 里是否放行** —— 被拦时已退化为复制链接并提示，但要确认走的是哪条
3. **图片主题色提取** —— canvas 在 jsdom 里不可用，量化算法本身有纯函数测试覆盖

---

（以下为原始计划）

父任务执行计划。只写**集成与验收**；各子任务的实现步骤写在各自的 `implement.md`。

包名 `@talex-touch/clipboard-history-plugin`，命令在 `plugins/clipboard-history/` 下执行。

## 阶段 0 · 基线（在任何子任务开工前做一次）

- [ ] `pnpm --filter @talex-touch/clipboard-history-plugin test` —— **记录实际通过数**，不要凭记忆写数字（[[baselines-and-tools-drift]]：基线要按分支重新测）
- [ ] `pnpm --filter @talex-touch/clipboard-history-plugin typecheck`
- [ ] `pnpm core:dev` 起一次，`Cmd+E` 打开剪贴板历史，对文本 / 图片 / 文件三类各截一张图存档，作为重排前后的对照

## 阶段 1 · 并行开工

- [ ] C1 `09-05-layout-shell` —— 独立 PR
- [ ] C2 `09-05-shape-classifier` —— 独立 PR

两个都在 `ClipboardDetail.vue` 上动手：C1 改结构骨架与样式，C2 只往洞察容器里加组件。**先合 C1，C2 rebase 后再合**——结构性改动不产生文本冲突，自动合并的部分才危险（[[semantic-merge-breaks-the-base]]）。

合入 C1 后：
- [ ] 重跑阶段 0 的两条命令，与基线逐条对比
- [ ] 确认 `ClipboardActionBar.test.ts` 的四条 pending 文案断言、`apply-button` 全称断言仍绿

## 阶段 2 · 依赖方

- [ ] C3 `09-05-color-capability`（依赖 C2）
- [ ] C4 `09-05-more-info-disclosure`（依赖 C1）

可并行，各自独立 PR。

## 阶段 2.5 · C5 文件预览（单独排期）

`09-05-file-preview`。**不要和阶段 2 混排**：

- [ ] 先单独提 `previewClipboardFile` 主进程能力的 PR，走安全评审；四条负向测试（不存在的 recordId / fileIndex 越界 / 超限文件 / 权限关闭）全绿再合
- [ ] 主进程能力合入后再做 P0 渲染器（图片 / 纯文本 / Markdown）
- [ ] P1（代码高亮）、P2（PDF、3D）各自评估依赖体积后再动手；`vite build` 后对比 chunk 清单确认是动态 import

## 阶段 2.6 · C6 记录分享

`09-05-record-share`。**有开工前阻塞项，先解再排期**：

- [ ] 和服务端确认分享链接的 URL 形状（`publish` 返回值里只有 `id`，没有 URL）以及 `unlisted` 包的未登录访问行为
- [ ] 确认 `kind: 'clipboard-item'` 是否需要服务端先注册
- [ ] 上面两条确认后再写 UI；第一版只支持文本 / 链接 / 颜色 / 代码片段（`contentInline`），图片与文件排后
- [ ] 全仓首个 `CloudShareSDK` 使用方，联调成本要算进排期

## 阶段 3 · 集成验收

四个子任务全部合入后，逐条核父任务 `prd.md` 的「跨子任务验收标准」：

- [ ] 详情面板内同一段内容只出现一次；纯文本列表行标题 ≠ 副标题
- [ ] 720×540 下切换文本 / 链接 / 图片 / 文件 / 颜色五类，预览区与详情区之间无空洞
- [ ] 分类条 9 项不横向滚动；每个分类的结果与其定义一致（逐个点一遍，不要只点两个就下结论）
- [ ] 复制 `#ABCDEE` → 落在「颜色」分类，预览是色卡，四格式 + 对比度齐全
- [ ] 选中 URL 记录 → 洞察是链接结构，`token` 参数掩码
- [ ] `git diff --stat` 不含 `apps/core-app/src/main/` 下的文件

## 阶段 4 · 收口

- [ ] `pnpm --filter @talex-touch/clipboard-history-plugin typecheck`
- [ ] `pnpm --filter @talex-touch/clipboard-history-plugin test` —— 与阶段 0 基线对比；**不允许出现"改断言就绿"**（[[tests-can-encode-the-defect]]）
- [ ] `pnpm lint` —— 只判 delta，绝不整文件 `--fix`（[[coreapp-lint-config-vs-root]]）
- [ ] `node ./scripts/sync-builtin.mjs` 同步到 `apps/core-app/resources/bundled-plugins/clipboard-history`
- [ ] `node ./scripts/assert-no-raw-channels.mjs`
- [ ] 真机自查：`pnpm core:dev` → `Cmd+E` → 五类记录逐个选中，与 pen 稿快照 `/tmp/pen-clip-export/*.png` 对照；截图留档

## Review Gate

- C1 合入后先跑一次 `trellis-check` 再放 C4 开工——高度契约是四个子任务的公共地基，错在这里后面全要返工。
- C3 的对比度数字（#ABCDEE：黑字 12.7:1 / 白字 1.65:1）在实现后必须实测对拍，不要信文档里的手算值。

## 回滚点

每个子任务一个 PR，回滚粒度 = 单 PR revert。C1 是唯一改布局根的任务，回滚它会连带影响 C3/C4 的视觉表现。

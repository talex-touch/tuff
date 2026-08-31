# 执行计划

Worktree：`/Users/talexdreamsoul/Workspace/Projects/tt-wt-avatar`
分支：`feat/tuffex-avatar-status-group`（base `af8fc362d` = `origin/master`）

所有命令的 CWD 都是 worktree 根，不是主 checkout。

---

## S1 修状态点裁切（design §1）

改 `packages/tuffex/packages/components/src/avatar/src/TxAvatar.vue` 的 `<style>`：

- [ ] S1.1 `.tx-avatar` 去掉 `overflow: hidden`（`:174`）
- [ ] S1.2 `.tx-avatar` 增加 `--tx-avatar-status-diameter` / `--tx-avatar-status-ring` 两个解析变量
- [ ] S1.3 `.tx-avatar__image` 加 `border-radius: inherit`
- [ ] S1.4 `.tx-avatar__fallback` 加 `border-radius: inherit; overflow: hidden`
- [ ] S1.5 三个 shape class 各加 `--tx-avatar-status-inset`
- [ ] S1.6 `.tx-avatar__status` 改用新变量 + `box-sizing: border-box`
- [ ] S1.7 加注释说明「根节点不能裁切，否则状态点又会被切」——这是最容易被后人改回去的一行

**验收点**：`pnpm --filter @talex-touch/tuffex test` 仍绿（此步不新增测试，jsdom 断不出裁切）。

**评审门**：S2 之前先做一次 CDP 目验（见 S7），确认圆形头像的图片没变方 —— 这是 S1 唯一有回归风险的地方，越早发现越便宜。

---

## S2 头像组布局重构（design §2.1-2.3）

改 `TxAvatarGroup.vue`：

- [ ] S2.1 子项内联 style 去掉 `marginLeft` / `zIndex`，改成 `'--tx-avatar-group-index': index + 1`；ring `border` 保持内联
- [ ] S2.2 组根内联加 `--tx-avatar-group-spread-overlap`、`--tx-avatar-group-more-z`
- [ ] S2.3 scoped CSS 加 `:deep(.tx-avatar-group__item)` 的 `z-index` / `margin-left` / `transition` 与 `:first-child` 归零
- [ ] S2.4 **改掉源码里那句 `Scoped styles never reach slot content` 的注释** —— 补上「直接选择器不行，`:deep()` 可以，因为组根带 scope id」，否则下一个人会绕回内联注入

**验收点**：现有三条 group 单测全绿（尤其 `:146` 的内联 border 断言、`:165` 的无内联 border-radius 断言）。

**回滚点**：S2 是唯一有对外观察差异的破坏性改动。若这里出问题，S1 已可独立成立，单独 commit S1 即可交付 bug 修复。

---

## S3 hover 特效（design §2.4-2.6）

- [ ] S3.1 `types.ts` 加 `hoverEffect` / `spreadOnHover` / `spreadOverlap`
- [ ] S3.2 `TxAvatarGroup.vue` 运行时 `props` 同步声明 + 默认值（`hoverEffect: 'lift'`、`spreadOnHover: false`、`spreadOverlap: 0`）
- [ ] S3.3 组根按 prop 挂 `is-hover-lift` / `is-spread-hover` class
- [ ] S3.4 scoped CSS 写 lift / spread / reduced-motion 三段

---

## S4 溢出 popover（design §3）

- [ ] S4.1 `types.ts` 加 `overflowPopover` / `overflowPopoverTrigger` / `overflowPopoverPlacement`，引入 `PopoverPlacement` 类型
- [ ] S4.2 `TxAvatarGroup.vue` 静态 `import TxPopover from '../../popover/src/TxPopover.vue'`
- [ ] S4.3 `+N` 分支拆两路：关闭时保持原样（AC7），开启时包 `TxPopover`，`referenceClass` 带 `tx-avatar-group__item` + `tx-avatar-group__more-ref`，内层头像不带 `__item`
- [ ] S4.4 默认面板：`.tx-avatar-group__overflow-grid` + `cloneVNode` 溢出节点
- [ ] S4.5 `overflow` 具名插槽，slot props `{ nodes, count }`
- [ ] S4.6 面板样式写成**独立选择器**（teleport 到 body，后代选择器不命中）

⚠️ eslint `--fix` 会把同源的 value import 与 type import 合并成 `import type`，静默炸掉运行时。`TxPopover` 是 value import，`PopoverPlacement` 是 type import，来自不同 specifier，注意别被合并；改完先看 import 段再跑 lint。

---

## S5 测试（AC11）

`packages/tuffex/packages/components/src/avatar/__tests__/avatar.test.ts` 补：

- [ ] S5.1 `hoverEffect` 默认 `'lift'` → 根节点有 `is-hover-lift`；传 `'none'` → 没有
- [ ] S5.2 `spreadOnHover` 开 → 根节点有 `is-spread-hover` 且内联含 `--tx-avatar-group-spread-overlap`
- [ ] S5.3 子项内联**不再**含 `margin-left` / `z-index`，但含 `--tx-avatar-group-index`
- [ ] S5.4 `overflowPopover` 默认关 → 找不到 `TxPopover` 组件（AC7）
- [ ] S5.5 开启 + 有溢出 → 找得到 `TxPopover`，`referenceClass` 含两个类名
- [ ] S5.6 开启但**无**溢出（`max` >= 子节点数）→ 不渲染 popover（AC/R3.5）
- [ ] S5.7 `overflow` 插槽覆写生效且拿得到 `count`
- [ ] S5.8 状态点：`circle` / `square` 下 `.tx-avatar__status` 存在且带对应 `--{status}` 修饰类（jsdom 只能断结构，裁切靠 S7 目验）

**每条测试逐条负控制**：写完后用 `git stash` 之外的方式（`git show HEAD:<file> > <file>`，见 repo 惯例）把源码退回，确认该测试**变红**，再恢复。不做这一步的测试等于没写。

---

## S6 文档与 demo（AC13-15）

- [ ] S6.1 `apps/nexus/content/docs/dev/components/avatar.zh.mdc`：Props 表补 6 个新 prop、Slots 表补 `overflow`、样式定制表补新变量、交互契约补三条（内联→变量、状态点外径含边框、组内叠放遮挡）
- [ ] S6.2 `avatar.en.mdc` 同步，**段数必须与 zh 相等**
- [ ] S6.3 更新 `AvatarGroupDemo.vue`（展示 hover）+ 新增 popover demo，接 demo registry
- [ ] S6.4 遵守 TuffEx 文档风格：H1 下不写导语，中文段名，`## 基础用法` 下变体作 `###`

---

## S7 验证（AC11-16）

按顺序跑，前一条不绿不进下一条：

```bash
# tuffex
pnpm --filter @talex-touch/tuffex lint
pnpm --filter @talex-touch/tuffex typecheck
pnpm --filter @talex-touch/tuffex test
pnpm --filter @talex-touch/tuffex build      # audit:size 读 dist，必须先 build
pnpm --filter @talex-touch/tuffex audit:size
pnpm --filter @talex-touch/tuffex audit:vocab

# nexus（依赖上面的 tuffex build 产物）
pnpm --filter nexus typecheck
pnpm --filter nexus check:doc-parity
pnpm --filter nexus check:mdc-fences
pnpm --filter nexus check:demo-registry
```

- [ ] S7.1 上述全绿
- [ ] S7.2 CDP 目验（无 Playwright，用 headless Chrome + `audit-cdp-client.mjs`）截图 avatar 文档页，逐项确认：状态点完整、圆形图片仍圆、hover lift、spread、popover 弹出
- [ ] S7.3 `audit:size` 若因新依赖报错 → 按 design §3.3 在 `onDemandImportBudgets` 补 `avatar` entry（这是预期动作，不是绕过）

注意：tuffex 与 nexus 的 typecheck 严格度不同，nexus 开了 `noUncheckedIndexedAccess`；tuffex 绿不代表 nexus 绿，两个都要跑。

---

## S8 收尾

- [ ] S8.1 `trellis-check` 全量走查
- [ ] S8.2 spec 更新（若 `:deep()` 穿透插槽这条结论值得沉淀，写进 `.trellis/spec/frontend/component-guidelines.md`）
- [ ] S8.3 提交（S1 与 S2-S6 可拆两个 commit，便于单独回滚 bug 修复）
- [ ] S8.4 直推 master 会被拒，走 PR 流

---

## 顺序依赖

S1 独立可交付。S2 是 S3 的前置（不重构就没法写 hover 规则）。S4 独立于 S3，但都依赖 S2 建立的类名与变量约定。S5 依赖 S2-S4 全部落地。S6 依赖最终 API 定稿。

# Implement — 全量补齐可交互组件的 cursor

## 顺序

1. **把扫描脚本落进仓库。**
   `/tmp/tuffex-cursor-scan.mjs` 是一次性产物，移到 `packages/tuffex/scripts/` 下成为可复跑的守卫。
   必须保留内置**阳性对照**：`button/` 在补齐前必须被标出；对照失败就说明扫描坏了，此时任何"没有发现问题"的结论都是构造性的空。
   补齐后对照要换成一个新的、故意注入的缺失点，或改成对照校验逻辑本身。

2. **A 类 13 个逐个核实。**
   `agents`、`base-anchor`、`cell-link`、`dialog`、`dropdown-menu`、`empty-state`、`flat-dropdown`、`fusion`、`inline-citation`、`loading-overlay`、`search-select`、`spark-chart`、`status-badge`

   每个都要回答三问，答案写进报告：
   - 这个元素真的可交互吗？（排除纯展示 `<a>`、仅为可访问性挂的 `tabindex="-1"`、容器上的 `@click` 委托）
   - 它是不是已经从别处拿到 cursor 了？（父级选择器、`style/index.scss`、全局规则、UnoCSS）
   - 该给什么值？

   从 `dropdown-menu` 开始——那是用户截图那一页，改完能立刻实机验证。

3. **B 类 8 个逐个核实**（假阳性率预期更高，样式常在兄弟文件里）：
   `button/src/button.vue`、`button/src/split-button.vue`、`chat/src/TxChatComposer.vue`、`context-menu/src/TxContextMenuItem.vue`、`flat-radio/src/TxFlatRadio.vue`、`group-block/src/TxBlockSwitch.vue`、`select/src/TxSelectItem.vue`、`switch/src/TxSwitch.vue`、`tabs/src/TxTabs.vue`

4. **`.tx-button` 基类补 `cursor: pointer`。**
   `button/src/style/index.scss` 基类现有 `&.disabled { cursor: not-allowed }`、`&.loading { cursor: progress }`。
   加在基类上之后，**要实际验证优先级**：`.disabled` / `.loading` 的值必须仍然赢。同一文件内后写的同特异性规则会赢，但基类声明位置在前——需要看编译产物或实测，不能只看源码顺序想当然。

5. **写死语义映射**（补的时候照这个来）：
   可点击 `pointer` / 禁用 `not-allowed` / 加载中 `progress` / 拖拽把手 `grab`·`grabbing` / 文本输入 `text`。

## 纪律

- **不批量替换。** 扫描输出是线索不是判决。
- **不夹带。** 顺手看到的别的样式问题写成代码注释 + 列进报告，不改。
- **不整文件 `--fix`。** core-app 与根 eslint 配置规则相反（尾逗号等），只判 delta。
- 报告按「确认缺失 / 已有覆盖（假阳性）/ 判定不需要」三类逐条给理由，不能只报总数。

## 验证命令

```bash
node packages/tuffex/scripts/<守卫脚本>   # 阳性对照必须 PASS
pnpm --filter @talex-touch/tuffex test
pnpm --filter @talex-touch/tuffex build
cd apps/nexus && pnpm typecheck
```

守卫首跑**不设为阻塞**——新 gate 的首跑基线不可信，先观察一轮。

## 实机验证

nexus 画廊 DropdownMenu 页 hover `+ Add` 触发器，确认出现指针光标。其余改动点抽查。

## 回滚点

按组件逐个提交粒度回滚。步骤 4（`.tx-button` 基类）影响面最大，单独验证后再继续。

# 执行清单

## 阶段 1：tuffex 组件层（无争用）
- [x] 1.1 迁移 icon-button/copy-button/os-icon 的 SFC+类型+测试到 button/、icon/，修内部相对 import（用普通 mv 避免暂存区争用）
- [x] 1.2 button/index.ts、icon/index.ts 增补导出与 install 注册（含 TxOsIconInstance、TxIconButtonInstance、TxCopyButtonInstance）
- [x] 1.3 components.ts、base/index.ts 各删 4 行；missing-export.contract.ts 适配（flat-button 断言删除、TxIconButtonProps 改指 button 入口）
- [x] 1.4 TxCodeBlock.vue、TxCodeStream.vue 相对引用改 button/src/copy-button.vue
- [x] 1.5 删 flat-button/ 及迁空三目录
- [x] 1.6 门禁 A：typecheck ✓、vitest 193 文件/1838 用例 ✓、build ✓、audit:exports/types/vocab ✓
- [x] 1.7（计划外）audit:size：button 入口 allowlist +icon（TxIconButton 渲染 TxIcon）；套件聚合桶（base/pro/ai，98e5d5327 引入时未同步审计）改按 fullCssBytes 上限——HEAD 上即红的存量缺口，self-test ✓
- [x] 1.8（计划外）audit:readme：README/README_ZHCN 清单 152→148、General 13→9

## 阶段 2：仓内消费方
- [x] 2.1 nexus DarkToggle/LanguageToggle/HeaderControls import 改 `@talex-touch/tuffex/button`
- [x] 2.2 ui/FlatButton.vue 删除；VersionDrawer 两处改 `TxButton variant="flat"`（视觉等价：同边框/8px 圆角/120px min-width）；plugins/tuffex.ts 删 3 个 loader + TuffFlatButton 注册，TxIconButton/TxOsIcon 改从 button/icon loader 取
- [x] 2.3 demo-registry 删 FlatButtonFlatButtonDemo + 删 demo 文件
- [x] 2.4 touch-music：IconButton.vue import 与 main.js style.css 迁 button
- [x] 2.5 tools/tuffex.{zh,en}.mdc：flat-button 示例换 tag；「已发布」表删 TuffFlatButton 行

## 阶段 3：文档层
- [x] 3.1 button.{zh,en}.mdc 并入 IconButton/CopyButton：API 六节 + Types 块 + Composition Notes 两节（demo 原样搬）+ 契约/实践/审阅/Source 增行；zh/en 标题数 32=32、demo 11=11
- [x] 3.2 icon.{zh,en}.mdc 并入 TxOsIcon：基础用法节 + API（简版）+ Events 句 + 契约/实践/审阅/Source；32=32
- [x] 3.3 删 8 个 mdc；hub index.{zh,en}.mdc 删 4 链接；code-stream.{zh,en}.mdc 源码路径更新
- [x] 3.4 TAXONOMY 更新 + icon-chip 移到 status-badge 后（TAXONOMY/SECTION_ORDER/hub 三处一致）
- [x] 3.5 guards/form-submit-button.test.ts 注释按现源码事实改（TxCopyButton 实为硬编码 type="button"）
- [x] 3.6 门禁 B：check:mdc-fences ✓、check:doc-parity ✓、check:demo-registry ✓

## 阶段 4：争用文件（talex-touch-bc 已于 253adcb81/76ef2fa9d 等提交，争用解除）
- [x] 4.1-4.3 DocsSidebar SECTION_ORDER ✓；docs-page-performance.test.ts:429 旧断言 `not.toContain('tuffex/button')` 与收拢矛盾——删该行并扩注释，`<TxButton` 标签禁令保留
- [x] 4.4 README 双语已同步（见 1.8）

## 阶段 5：全量门禁 + 提交
- [x] 5.1 nexus 全量 vitest 226 文件/1412 用例 ✓；nexus typecheck ✓；core-app typecheck ✓；tuffex/nexus 改动文件 eslint ✓（未用 --fix）
- [x] 5.2 CHANGELOG [Unreleased] 增「💥 破坏性变更」两条
- [x] 残留扫描（带阳性对照）：深子路径/TuffFlatButton/旧目录路径全仓零命中（CHANGELOG 除外）
- [x] 5.3 显式路径一步 stage+commit（提交前核对 git status 66 路径全属本任务）

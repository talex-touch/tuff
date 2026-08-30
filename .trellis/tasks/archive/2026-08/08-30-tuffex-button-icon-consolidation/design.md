# 技术设计

## 文件布局（终态）

```
button/
├── index.ts            # + TxIconButton、TxCopyButton 及类型导出
├── src/
│   ├── button.vue / types.ts / split-button.vue / split-button.ts   (不动)
│   ├── icon-button.vue   # ← icon-button/src/TxIconButton.vue（内部 TxIcon 引用改 ../../icon/src/TxIcon.vue）
│   ├── icon-button.ts    # ← icon-button/src/types.ts（TxIconButtonProps）
│   └── copy-button.vue   # ← copy-button/src/TxCopyButton.vue（props 内联，无独立类型文件）
└── __tests__/
    ├── button.test.ts / split-button.test.ts  (不动)
    ├── icon-button.test.ts  # ← 迁移，import 路径改 ../src/icon-button.vue
    └── copy-button.test.ts  # ← 迁移

icon/
├── index.ts            # + TxOsIcon 导出；install 注册 'TxOsIcon'
├── src/
│   ├── TxIcon.vue / TxStatusIcon.vue / types.ts / ...  (不动)
│   └── TxOsIcon.vue    # ← os-icon/src/TxOsIcon.vue 原样
└── __tests__/os-icon.test.ts  # ← 迁移
```

命名遵循各目录既有惯例：button 目录 kebab（button.vue/split-button.vue），icon 目录 Pascal（TxIcon.vue/TxStatusIcon.vue）。

删除：`flat-button/`（组件冗余）、`icon-button/`、`copy-button/`、`os-icon/`（已迁空）。

## 同步点（缺一门禁必红）

1. `src/components.ts` — 删 4 行 `export * from './x/index'`（覆盖测试由此推导必需文档页）。
2. `src/base/index.ts` — 套件桶删同 4 行（base∪pro∪ai 必须恒等于 components.ts）。
3. `missing-export.contract.ts` — 删 flat-button 类型断言；icon-button 类型 import 改指 `./src/button/index`。
4. 内部相对引用：`stream-markdown/src/TxCodeBlock.vue`、`code-stream/src/TxCodeStream.vue` 的 `../../copy-button/src/TxCopyButton.vue` → `../../button/src/copy-button.vue`。
5. vite.config.js 按目录自动发现入口，无需改（flat-button/style/index.scss 无任何引用，随目录死亡）。

## 消费方迁移

| 文件 | 动作 |
|---|---|
| nexus DarkToggle / LanguageToggle / HeaderControls | import 源改 `@talex-touch/tuffex/button` |
| nexus ui/FlatButton.vue | 删除；VersionDrawer 用点改 `TxButton variant="flat"`（mini→size="sm"，读用点后定映射） |
| nexus plugins/tuffex.ts | 去掉 TuffFlatButton 相关注册/引用 |
| nexus demo-registry.ts + demos/FlatButtonFlatButtonDemo.vue | 删条目 + 删文件（组件已亡，demo 无法编译） |
| touch-music IconButton.vue | import 源改 `@talex-touch/tuffex/button` |
| touch-music main.js | `icon-button/style.css` → `button/style.css`（若已引则直接删行） |
| tools/tuffex.{zh,en}.mdc | flat-button 子路径示例换成仍存在的组件（如 tag） |

## 文档合并

- button.{zh,en}.mdc：读现有结构后，将 icon-button、copy-button 两页内容作为 `## 图标按钮` / `## 复制按钮`（en 对应中文段名惯例按现页既有风格）章节并入，TuffDemoWrapper 引用原 key 原样搬（IconButtonIconButtonDemo、CopyButtonCopyButtonDemo 不改名，registry 不动）；「实测覆盖」路径改为 `button/__tests__/...`。flat-button 页内容不搬（若 button 页尚无 flat 变体 demo，补一个 `###` 级变体小节复用现有 demo 体系，不新建 registry 条目则复用 props 表说明）。
- icon.{zh,en}.mdc：os-icon 页并入为 `## OS 图标` 章节（OsIconOsIconDemo 原样搬）。
- 删除 8 个 mdc；hub index.{zh,en}.mdc 删 4 组链接。
- TAXONOMY（recategorize-component-docs.py）与 SECTION_ORDER（DocsSidebar.vue）：Basic 仅剩 button、icon 打头，icon-chip 移至 status-badge 之后。
- zh/en 段数、标题层级对等（H1 下无导语；`## 基础用法` 容器、变体作 `###`）。

## 测试适配

- `nexus test/guards/form-submit-button.test.ts`：读后按其扫描机制更新路径/集合（引用 TuffFlatButton、TxCopyButton、扫描 tuffex 源路径）。
- `nexus app/pages/docs/docs-page-performance.test.ts:439`：断言改 `@talex-touch/tuffex/button`。
- 迁移的 3 个组件测试只改 import 路径，不改断言（tests-can-encode-the-defect：不趁机"顺手改"）。

## 并发提交协议

DocsSidebar.vue、docs-page-performance.test.ts、README*.md 在 talex-touch-bc 的提交批次里。顺序：先做 tuffex 侧全部 + nexus 非争用文件；触碰争用文件前 `git status` 确认已转 clean，未 clean 则 SendMessage 协调。本任务提交用显式路径列表一步完成。

## 回滚

单分支线性提交，回滚 = revert 对应提交；npm 未发版前无外部影响。

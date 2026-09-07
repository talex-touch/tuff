# Design — 剪贴板历史：密钥掩码一致性与交互修复

## 边界

改动集中在 `plugins/clipboard-history/src/`，外加 `packages/utils/plugin/sdk/system.ts` 一处能力扩展。主进程、数据库、分类器（C2）不动。

| 层 | 文件 | 改什么 |
|---|---|---|
| 共享 SDK | `packages/utils/plugin/sdk/system.ts` | 新增 `openExternal` / `showInFolder` 两个方法 |
| 形态判定 | `src/utils/clipboard-shapes.ts` | `ClipboardSecretInfo.maskedContent`；`getClipboardDisplayTitle`；`getClipboardPreviewText`；`resolveClipboardPrimaryAction` |
| 列表 | `src/components/ClipboardSidebar.vue` | 标题与 `title` 属性改走掩码函数 |
| 详情 | `src/components/ClipboardDetail.vue` | 预览掩码 + 显示开关；色带竖排；大图浮层；`previewFile` 语义 |
| 洞察 | `src/components/ClipboardInsight.vue` | 接 `revealSecret` prop；内部 link-param 的 ref 改名避冲突 |
| 更多信息 | `src/components/ClipboardMoreInfo.vue` | 密钥记录抑制「字符拆分」 |
| 底栏 | `src/components/ClipboardActionBar.vue` | 主动作按钮文案与 emit 名跟随类型 |
| 容器 | `src/views/ClipboardManagerView.vue` | Cmd/Ctrl+←/→；主动作分派；接线 `previewFile` |
| 全局样式 | `src/main.css` | `user-select` 基线 |

## D1 掩码的单一来源

现状是三个表面各自直接读 `item.content`，所以"加了掩码"只在其中一个表面成立。修法不是在三处各写一遍掩码，而是让这三处都拿不到原始内容。

`ClipboardSecretInfo` 增加一个字段：

```ts
export interface ClipboardSecretInfo {
  service: string
  kind: 'token' | 'private-key' | 'connection-string' | 'jwt' | 'env'
  /** 值本身的脱敏展示（洞察区「值」那一行）。 */
  masked: string
  /** 整条内容的脱敏展示（列表标题、预览区）。env 类型会带上键名。 */
  maskedContent: string
  length: number
  critical: boolean
  detail?: string
}
```

`maskedContent` 的取值：

| kind | maskedContent |
|---|---|
| `token` / `jwt` | `masked` |
| `connection-string` | `masked`（本来就是整串，只掩了密码段） |
| `env` | `` `${service}=${masked}` `` |
| `private-key` | `'私钥内容不予显示'` |

两个新导出（放 `clipboard-shapes.ts` — 它已经 import `clipboard-items.ts`，反向不成立，加在这边不成环）：

```ts
export function getClipboardDisplayTitle(item: PluginClipboardItem): string
export function getClipboardPreviewText(item: PluginClipboardItem, reveal: boolean): string
```

- `getClipboardDisplayTitle`：命中密钥 → `maskedContent`（再走原有的 72 字截断）；否则透传 `getClipboardTitle`。**不接受 reveal 参数** —— 列表永远掩码。
- `getClipboardPreviewText`：`reveal === true` 且 `kind !== 'private-key'` 时返回原文；否则返回 `maskedContent`；非密钥透传 `item.content`。

`private-key` 的 reveal 在函数层就被吞掉，不依赖 UI 记得不渲染开关 —— 这是双保险，UI 那层也不渲染。

## D2 reveal 状态归属

单一状态放在 `ClipboardDetail`（预览区和洞察区的共同父级）：

```
ClipboardDetail
  ├─ revealSecret = ref(false)，watch(() => props.item?.id) 复位
  ├─ 预览区：显示 getClipboardPreviewText(item, revealSecret)
  ├─ 开关按钮（v-if secret && secret.kind !== 'private-key'）
  └─ ClipboardInsight :reveal-secret="revealSecret"
```

`ClipboardInsight` 内部已有一个 `revealSecret` ref 服务于**链接的敏感参数**，与本次的密钥 reveal 是两码事。把它改名 `revealParams`，新增 prop `revealSecret?: boolean` 控制「值」那一行。两者不共享，避免"点开链接参数顺手把密钥也露了"。

洞察区「值」在 reveal 时显示 `secret.masked` → 改为显示原始值。原始值从哪来？`ClipboardInsight` 有 `props.item.content`，直接用 `getClipboardPreviewText(item, props.revealSecret)` 对 env/连接串不合适（那是整条）。所以「值」这一行单独取：`reveal ? rawSecretValue : secret.masked`，其中 `rawSecretValue` 由 `detectSecret` 一并返回更干净 —— 但那等于把明文塞进一个到处传递的对象。

**决定**：不给 `ClipboardSecretInfo` 加原文字段。「值」这一行 reveal 时显示 `secret.maskedContent` 之外的完整值，由 `ClipboardInsight` 自己从 `props.item.content` 现算（env 走一次 `split('=')`，其它就是 `content.trim()`）。一个 6 行的本地函数，换来密钥对象里永远没有明文。

## D3 字符拆分抑制

`ClipboardMoreInfo` 的 `textInsight` computed 前置一道判定：

```ts
const textInsight = computed(() =>
  detectSecret(props.item?.content) ? null : getClipboardTextInsight(props.item),
)
```

`summary` 是从"实际会渲染出来的分区名"拼的（文件里的注释已经立了这条规矩），所以 summary 自动同步，不需要第二处改动。

## D4 user-select 基线

`main.css`：

```css
#app {
  user-select: none;
  -webkit-user-select: none;
}

input,
textarea {
  user-select: text;
  -webkit-user-select: text;
}
```

放开选中的地方（各组件 scoped style 就近声明，不靠全局选择器猜）：

- `ClipboardDetail` 的 `.code-preview`（文本预览正文）
- `ClipboardInsight` 的 `.ocr-text`

密钥记录未 reveal 时预览区渲染的就是掩码串，所以"可选中"不等于"可复制到明文"。

## D5 图片预览区布局

问题根因是三条约束叠加：`.preview-surface` `max-height: 45%` + `overflow: auto`，`.image-container` `min-height: 220px`，`.image-block` 竖排（图 + 色带 + 说明）。竖排把色带和说明推到 45% 之外，于是出现滚动条。

改成横排，色带贴在图片右侧：

```
.image-block  → flex row, gap 8px, min-height: 0
  .image-frame  → flex: 1 1 auto, min-width: 0
  .palette-rail → flex: 0 0 16px, flex-direction: column（竖排色块）
```

- 删掉 `.palette-caption` 这一行，说明改挂 `.palette-rail` 的 `title="主题色 · 点击复制"`（垂直空间是这次的稀缺资源）。
- `.image-container { min-height: 0 }`，`.preview-img { max-height: 100% }` —— 让图片被容器约束而不是反过来撑破它。
- `.preview-surface[data-kind='image'] { overflow: hidden }` —— 图片预览区不该有滚动条；文本/文件的 `overflow: auto` 保持。

## D6 分类条键盘切换

`ClipboardManagerView.handleKeydown` 新增分支，放在现有 ArrowDown/Up 分支之前：

```ts
if ((event.metaKey || event.ctrlKey) && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
  event.preventDefault()
  event.stopPropagation()
  moveFilter(event.key === 'ArrowRight' ? 1 : -1)
  return
}
```

`moveFilter` 在 `filterOptions.filter(o => o.ready)` 上取模循环。现有的 `isEditableTarget` 早退保持在最前，输入框里不接管。footer hints 补一条 `⌘/Ctrl ←→ 切换分类`。

## D7 主动作分派

新增（`clipboard-shapes.ts`，需要 `extractLinks`）：

```ts
export type ClipboardPrimaryAction =
  | { kind: 'open-link'; url: string }
  | { kind: 'preview-image' }
  | { kind: 'reveal-file'; path: string }
  | { kind: 'copy' }

export function resolveClipboardPrimaryAction(item: PluginClipboardItem | null): ClipboardPrimaryAction
```

判定顺序（第一个命中即返回）：

1. `type === 'image'` → `preview-image`
2. `type === 'files'` → 有路径则 `reveal-file`（取第一个），否则 `copy`
3. 文本且 `extractLinks(content).length > 0` → `open-link`（取第一个）
4. 其余 → `copy`

`ClipboardActionBar` 新增 prop `primaryActionLabel: string`，`copy-button` 的 emit 从 `copy` 改名为 `primary`（按钮已经不只是复制了，留着 `copy` 这个名字会让下一个人读错）。`data-testid` 保持 `copy-button` 不变，避免无谓地波及其它断言。

`ClipboardManagerView` 的分派：

| action | 实现 |
|---|---|
| `open-link` | `system.openExternal(url)`，替换现有的 `window.open` |
| `preview-image` | 本地 `imageViewerOpen` ref → `ClipboardDetail` 的全屏浮层 |
| `reveal-file` | `system.showInFolder(path)` |
| `copy` | 现有 `handleCopy()` |

`ClipboardDetail` 的 `previewFile` 事件接到 `system.showInFolder(file.path)` —— 与 Cmd+Enter 同一条路径，只是路径来源是被点的那一行。

大图浮层打开时，`handleKeydown` 早退：Esc 关浮层，上下键不再改选中项。浮层放在 `ClipboardDetail` 内部（它已经持有 `imagePreview.src` 与失败重试状态），由 `ClipboardManagerView` 通过 `v-model` 风格的 prop + emit 控制开合。

## D8 SDK 扩展

`packages/utils/plugin/sdk/system.ts` 的 `PluginSystemSDK` 增加两个方法，沿用现有 `createPluginSystemSDK(transport)` + 顶层便捷函数 + `system` 常量的三段式：

```ts
openExternal: (url: string) => Promise<void>   // AppEvents.system.openExternal
showInFolder: (path: string) => Promise<void>  // AppEvents.system.showInFolder
```

两者都已在主进程 `system-shell-handlers.ts` 注册且插件通道可达（`openExternal` 经 `validateExternalUrl`，`showInFolder` 经 `fs.stat` 存在性校验）。SDK 侧只做参数非空校验，不重复实现策略 —— 策略的唯一权威留在主进程。

不新增 manifest 权限：这两条走的是既有的 app 通道，与 `system.applications`（`resolveApplication`）同级；如果实测发现被权限层拦下，再补 `permissions.required`，并在实现记录里写明。

## 风险

1. **`showInFolder` 在插件通道的实际可达性**只从代码路径推断（`transport.on` 同时注册到插件通道，`system-shell-handlers.ts:99` 的注释佐证），没有跑过。里程碑 5 的第一步就是实测，打不通就退回"复制路径 + 提示"，并把结论写进 `implement.md`。
2. **`emit('copy')` 改名 `primary`** 会让 `ClipboardActionBar.test.ts` 里一条断言失败，属于预期内的契约变更，同批修改。
3. **`user-select: none`** 可能影响到目前依赖选中的既有操作（未发现，但没有全量点过）。若发现某处需要选中，就近加 `user-select: text`，不要回退全局基线。

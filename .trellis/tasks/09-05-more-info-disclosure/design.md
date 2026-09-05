# C4 技术设计 · 更多信息折叠区

## 1. 边界

| 文件 | 改动 |
| --- | --- |
| `src/components/ClipboardMoreInfo.vue` | **新增**：折叠条 + KV 行 + 完整调色板 / 字符拆分 |
| `src/utils/use-disclosure-state.ts` | **新增**：折叠态的本地持久化（可降级） |
| `src/components/ClipboardDetail.vue` | 详情区末尾挂 `<ClipboardMoreInfo>` |
| `src/components/ClipboardInsight.vue` | 字符网格保持 3 行折叠（完整网格归此处） |

## 2. 折叠态持久化

`usePluginStorage()` 在插件上下文外会抛（`usePluginName` / `ensureRendererChannel`）。
所以包一层 `useDisclosureState(key, fallback)`：

- 拿不到 storage 就退回内存状态，组件照常可用，只是不跨会话保持；
- 状态是**全局一个**，不是 per-item——用户展开过一次就说明想一直看到；
- 写入 debounce 200ms，避免连点产生一串 IPC。

存储文件 `ui-state.json`，形如 `{ "moreInfoExpanded": true }`。

## 3. 折叠区内容

| 行 | 来源 | 出现条件 |
| --- | --- | --- |
| MIME | `inferClipboardMime`（**全称**，摘要条里是缩写） | 总是 |
| Bundle ID | `getClipboardSourceInfo().bundleId` | 有 bundleId |
| 记录时间 | 完整时间戳（摘要条是 `09/05 03:49` 短格式） | 有 timestamp |
| 记录 ID | `item.id` | 总是 |
| 原图路径 | `meta.image_original_url` | 图片且有值 |
| 完整调色板 | 图片主题色（C3 提取）或 `getClipboardColorTokens` | 非空 |
| 字符拆分 | `getClipboardTextInsight().characterTokens` | 文本且非空 |

**字符拆分不能标成「完整」**：`getClipboardTextInsight` 把 `characterTokens` 截到 80 个，
所以标注写成 `N / 总数`，不假装是全部。

## 4. 折叠条右侧摘要

按类型动态列出里面有什么，让用户不展开也知道值不值得展开：

```
链接文本  MIME · 原始文本 · 字符拆分 · 记录 ID
图片      MIME · Bundle ID · 完整调色板 · 原图路径
文件      MIME · Bundle ID · 逐个文件大小 · 记录 ID
颜色      MIME · 原始文本 · 相近色 · 记录 ID
```

实现上不写死四套文案，而是**由实际渲染出的分区名拼**——否则会出现「摘要说有原图路径、
展开却没有」的空头支票。

## 5. 高度契约

折叠区展开后由 C1 的 `.info-surface { flex:1 1 auto; min-height:0; overflow:auto }` 兜底滚动。
**不得给折叠区或其子节点加固定高度**。

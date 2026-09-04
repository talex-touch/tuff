# Step 0 调查结论

Task: `09-04-transport-resource-unify`
勘察日期:2026-09-04

## 1. 死信道判定

| 事件 | main 侧注册 | 渲染端/插件调用者 | 判定 |
|---|---|---|---|
| `recommendation.get` | `search-core.ts:2129` | **无** | 真死 |
| `recommendation.aggregateTimeStats` | `search-core.ts:2147` | **无** | 真死 |
| `recommendation.isPinned` | `search-core.ts:2194` | **无** | 真死(功能冗余) |
| `recommendation.reportExposure` | `search-core.ts:2149` | `useSearch.ts:921` | **活的** |

搜索范围:`apps/`、`packages/`、`plugins/`(排除 `node_modules` / `out` / `dist`)。
三个死信道在 `packages/utils/__tests__/transport-domain-sdks.test.ts` 中只有
**事件名字符串断言**,不构成消费者。

### 不是「刻意保留的外部契约」

`legacy-alias-tombstones.ts:325-341` 三条墓碑的 `direction` 均为
**`renderer-to-main`**,`sourceModule: "SearchEngineCore"`,`removedIn: "2.4.13-beta.14"`。
即:它们曾经是渲染端调用的内部信道,在 beta.14 的事件重命名中记录了旧名。
**不是插件可见的对外 API**,因此没有「保留给外部插件」的理由。

### `isPinned` 额外冗余

pin 状态完全通过 `item.meta.pinned.isPinned` 在 item 上流转:

- 写:`useActionPanel.ts:62` 在 toggle 响应后直接改 `targetItem.meta.pinned`
- 读:`useKeyboard.ts:293`、`useSearch.ts:910`、`BoxGrid.vue:72`

不存在需要单独查询 pin 状态的场景。

### 结论

三者均可删除,**但本任务不执行删除**(见 PRD B2),另提任务。
删除时需一并清理 `search-core.ts` 的三个 handler 及其实现函数。

## 2. 渲染端 `update` chunk 语义:**已经是按分数重排,不是追加**

`useSearch.ts:995` 的 `update` 分支调用 `mergeRenderedItems` → `rankRenderedItems`
(`:544`),排序键为:

```ts
if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
if (b.score !== a.score) return b.score - a.score      // item.scoring.final
if (a.previousRank !== b.previousRank) return a.previousRank - b.previousRank
```

函数上方的注释写明了意图:

> Rank by the score the backend ranker wrote onto the item, so a later batch
> competes with the earlier ones instead of being appended below them.

而推荐项经 `item-rebuilder.mergeAndEnrichItems` 已写入
`item.scoring = { ...item.scoring, final: scored.score }`。

### 对 design 的影响

`design.md` §2.4 的三选一**不需要选**:方案二(追加 + 渲染端按分数插入)
已经完整存在。追加的推荐项会自动落到正确位置,且:

- 焦点跟随条目而非行号(`restoreFocusedItem`)
- 同分时保持用户正在看的顺序(`previousRank`)
- pin 项恒定置顶

**A1 的实现范围因此显著缩小:只需在空态分支发出 `update` chunk,渲染端零改动。**

## 3. `stream:` scheme 门禁:**不通过,建议砍掉**

### 判据

门禁问题是「有什么资源是 tfile 覆盖不到的」。逐一清点当前所有资源消费场景:

| 资源 | 现状 | tfile 是否够用 |
|---|---|---|
| 应用图标 | `search-processing-service.ts` → `toTfileUrl` | ✅ |
| 文件缩略图 / 图标 | `addon/files/utils.ts` → `toTfileUrl` | ✅ |
| 截图 | `NativeScreenshotCaptureResult.tfileUrl` | ✅ |
| 剪贴板图片 | `clipboard-recommendation-source` → 缩略图 URL | ✅ |
| 壁纸 | `useWallpaper.resolveWallpaperUrl` | ✅ |
| 预览资源 | `TuffItemPreviewer` → `buildTfileUrl` | ✅ |
| 原生文件缩略图 | `native-file-service.ts` → `toTfileUrl` | ✅ |
| ASR 流式识别 | `voice.asrStream` 走 transport stream protocol,载荷是**文本** partial | ✅ 与资源无关 |
| TTS 合成音频 | `VoiceSpeakResult.audio` = **base64 data URL** | ⚠️ 见下 |

**没有任何一项需要一个字节流式的 URL scheme。** 全部是有限 blob,
物化到 allowlist 目录后由 tfile 的 streaming 响应提供即可。

### 唯一的边界案例:TTS 音频,但它不需要 `stream:`

`voice-service.ts:221-233` 拿到 `tts.audio`(data URL)后原样放进
`VoiceSpeakResult.audio` 返回渲染端。这是音频字节以 base64 跨 IPC,
**违反 `native-resource-protocols.md` 的边界规则**
(「Electron main → renderer = bounded control metadata + resource descriptors only」)。

但它的正确修法是**物化 + tfile**(与截图完全同构),不是新建 scheme。
这是一处既有违规,**不在本任务范围**,应另提任务。

### 结论

**`stream:` scheme 无消费者,砍掉。**

理由不是「暂时不做」,而是 spec 明确禁止无契约的 blob 隧道:
注册一个 privileged scheme 却没有真实消费者,比不注册风险更高 ——
它会成为后来者绕过 tfile allowlist 的现成入口。

`native-resource-protocols.md` 的 `stream` 行改为「未注册、未实现;标识符保留」。

## 4. 附带发现:tfile URL 构造有**两份独立实现**

这才是「tfile 控制面分散」的实质。

| 实现 | 位置 | 使用方 |
|---|---|---|
| `toTfileUrl(pathOrUrl)` | `packages/utils/network/file.ts:92` | 主进程(7 个模块) |
| `buildTfileUrl(filePath)` | `apps/core-app/src/renderer/src/utils/tfile-url.ts` | 渲染端(6 个组件) |

### 实测对比(10 组输入)

两者对**所有真实本地路径完全一致**(绝对路径、含中文与空格、Windows 盘符、
`tfile://` 回环、`file://`、空串),但对**非本地输入分叉**:

| 输入 | `toTfileUrl` | `buildTfileUrl` |
|---|---|---|
| `https://example.com/a.png` | 原样返回 | `tfile:///https%3A//example.com/a.png` |
| `data:image/png;base64,AAAA` | 原样返回 | `tfile:///data%3Aimage/png%3Bbase64%2CAAAA` |
| `relative/path.png` | 原样返回 | `tfile:///relative/path.png` |

渲染端版本会把远程 URL / data URL **强转成畸形 tfile URL**,
经协议 handler 必然 400 或 403。

### 证据:调用方已经在手写守卫

`useWallpaper.ts:33-37` 自己补了一道 http/data 判断:

```ts
function resolveWallpaperUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return ''
  if (pathOrUrl.startsWith('http') || pathOrUrl.startsWith('data:')) return pathOrUrl
  return buildTfileUrl(pathOrUrl)
}
```

——正是 `toTfileUrl` 内置的那道守卫。其余 5 个调用点
(`TuffItemPreviewer`、`UnifiedFileTag`、`ClipboardFileTag`、`FileTag`、`ThemeStyle`)
**没有守卫**。`ThemeStyle` 的自定义背景路径由用户设置,是最可能踩中的一个。

### 结论

C1(tfile 控制面收敛)的落地内容就是:**删除渲染端副本,改为复用共享实现**,
并移除 `useWallpaper` 中因此变得多余的手写守卫。

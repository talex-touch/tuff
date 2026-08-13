# 设计：设置页接入骨架加载态

## 1. 规划期假设的修正

父任务 PRD 假设 13 个页面版式统一（`SettingSection` + `SettingRow`）。实测**不成立**：

| 形态 | 页面 | 处理方式 |
|---|---|---|
| `SettingSection` + `SettingRow` | `SettingSkillsMcp` 等 | 直接用 `SettingSkeleton` |
| 自有列表结构 | `SettingPlatformCapabilities`（`PlatformCapabilities-List`，加载态只是一行「loading」文字） | 在其自有容器内用 `TxRowSkeleton` |
| 多个独立区域各自加载 | `SettingFileIndex`（`sourceDiagnosticsLoading` / `searchProviderConfigLoading` / `deviceIdleDiagnosticLoading` 三个互不相干的 ref） | 区域级骨架，不做整页骨架 |
| 哨兵式 | `SettingTools`（`computed(() => shortcuts.value === null)`） | 已是最干净的形态，直接复用 |

因此**没有一刀切方案**，逐页判形态是必要步骤，不是可省的谨慎。

## 2. 核心问题：`ref(false)` 首帧不显示骨架

主流写法是：

```ts
const loading = ref(false)          // 首帧为 false
onMounted(() => { load() })
async function load() {
  loading.value = true              // 挂载后才置 true
  try { ... } finally { loading.value = false }
}
```

直接把骨架绑到 `loading` 上，首帧 `loading === false` → 渲染「空内容」分支，下一 tick 才变 true。用户看到的是**空白 → 骨架 → 内容**，比现状更抖。这是接入骨架时最容易踩且最难自查的坑。

### 方案：用 `hasLoaded` 哨兵，而不是把 `loading` 初值改成 `true`

```ts
const hasLoaded = ref(false)        // 首帧为 false → 骨架立即可见
async function load() {
  loading.value = true
  try { ... } finally {
    loading.value = false
    hasLoaded.value = true          // 只在首次完成后翻转，之后恒为 true
  }
}
const showSkeleton = useDeferredLoading(computed(() => !hasLoaded.value))
```

**为什么不直接把 `loading` 初值改成 `true`**：`loading` 在多个页面同时用于禁用按钮（如 `SettingPlatformCapabilities:165` 的 `:disabled="loading"`）。改初值会连带改变按钮的初始可用性，属于顺手改语义。`hasLoaded` 是新增维度，不干扰既有用途。

**顺带满足 R4**：`hasLoaded` 一旦为 true 就不再回落，所以后台刷新（第二次调用 `load()`）**不会**重新显示骨架——这正是「已渲染内容不得被替换成骨架」的要求，无需额外判断。

## 3. 骨架与真实版式的对应

`SettingSkeleton` 的 `groups` 必须照抄该页**加载完成后**的真实结构，而不是随便填个 3×4：

- 分组数 = 该页 `SettingSection` 的实际个数；
- 每组 `rows` = 该组内 `SettingRow` 的实际条数（条数随数据变化时取典型值，并在页面上注明依据）；
- `description` / `trailing` / `leading` 按该组行的实际构成开关。

几何无需在页面侧指定：`TxRowSkeleton` 的默认值已等于 `SettingRow`，并由 `SettingSkeleton.geometry.test.ts` 守住（跨包契约测试，任一侧改动即红）。

## 4. 逐页判定标准

对每个页面回答三问，结论记进 `implement.md`：

1. **有没有可感知的首次加载等待？** 数据来自主进程 SDK 往返的算有；纯本地同步配置的不算 → 判「不适用」。
2. **版式是否已知稳定？** 是 → 骨架；随数据变化（条数不定、结构不定）→ 保留空态或 pending 文案。
3. **是整页还是区域？** 多个独立 loading ref → 区域级，不做整页骨架。

## 5. 不做的事

- 不改数据加载逻辑、SDK 调用、状态管理（只加 `hasLoaded` 这一个呈现维度）。
- 不改 `SettingSection` / `SettingRow` 的视觉与交互。
- 不动 20 个无加载态的设置页。
- 不顺手修页面里发现的其他缺陷，记录后上报。

## 6. 验证

| 项 | 方式 |
|---|---|
| 无布局跳变 | 逐页核对骨架分组/行数与真实结构一致；结论逐页记录，不接受一句「已核对」 |
| 首帧即骨架 | 确认绑定的是 `hasLoaded` 哨兵而非 `loading` |
| 后台刷新不显骨架 | `hasLoaded` 单向翻转即保证；在有刷新按钮的页面实测 |
| 无手搓 | 改动文件内不得出现新的骨架 div 或 `@keyframes` |
| 回归 | 该目录已有大量 `*.test.ts` 显示逻辑测试，须确认加载态分支改动未破坏断言 |

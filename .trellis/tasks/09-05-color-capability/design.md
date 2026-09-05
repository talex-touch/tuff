# C3 技术设计 · 颜色能力

## 1. 边界

| 文件 | 改动 |
| --- | --- |
| `src/utils/clipboard-colors.ts` | **新增**：色值解析、四格式转换、对比度、调色板量化 |
| `src/utils/clipboard-colors.test.ts` | **新增** |
| `src/components/ClipboardInsight.vue` | 颜色分区从「色卡网格」升级为「四格式 + 对比度」 |
| `src/components/ClipboardDetail.vue` | 图片预览下方主题色带；缩略图角标移到右下角 |

## 2. 色彩数学

```ts
export interface Rgb { r: number; g: number; b: number; a: number }

parseColor(value: string): Rgb | null        // #rgb / #rrggbb / #rrggbbaa / rgb() / rgba()
toHex(rgb): string                           // 大写
toRgbString(rgb): string
toHslString(rgb): string
toOklchString(rgb): string
relativeLuminance(rgb): number               // WCAG 2.x
contrastRatio(a, b): number
describeContrast(rgb): { black: {...}, white: {...} }
```

OKLCH 走标准链路：sRGB → 线性 → OKLab → OKLCH。

**对比度数字必须由实现算出来再写进文档，不能沿用手算值**（PRD 里 #ABCDEE 的
12.7:1 / 1.65:1 是手算的，实现后按测试实测值订正）。

WCAG 判定：≥7 AAA、≥4.5 AA、≥3 AA Large、否则不达标。

## 3. 图片主题色

**已核实**：主进程从未写过 `dominant_color` / `palette` / `accent_color`
（`grep -rn` 于 `apps/core-app/src/main/modules/clipboard/` 无命中），
所以 `getClipboardColorTokens` 对图片恒为空，不能指望它。

改为渲染进程侧从缩略图提取：

```ts
export function quantizePalette(pixels: Uint8ClampedArray, max?: number): string[]
export async function extractPaletteFromImage(src: string, max?: number): Promise<string[]>
```

- `quantizePalette` 是**纯函数**（吃像素数组、吐 HEX），jsdom 里可直接测。
- `extractPaletteFromImage` 只是 `<img>` + 离屏 `<canvas>` 的薄壳：降采样到 48×48 再量化，
  按 4 bit/通道分桶取频次前 N，跳过接近全透明的像素。
- 组件内按 `item.id` 缓存，切回同一条不重算；取不到缩略图或 canvas 不可用时**整条不渲染**。

不改主进程、不加 IPC、不动数据库。

## 4. UI

- **颜色文本**：洞察区四行格式（HEX / RGB / HSL / OKLCH），逐行点击复制；
  标题右侧给对比度结论（`黑字 x:1 AAA`）。
- **图片**：缩略图正下方 16px 高色带（等宽分段）+ 一行 `主题色 · 点击复制`；
  点击色块复制该 HEX。
- **缩略图角标**：从图片左上移到**右下**，不遮挡主体。

## 5. 风险

| 风险 | 处理 |
| --- | --- |
| 量化在大图上卡顿 | 只对缩略图取样，且强制降采样到 48×48 |
| jsdom 无 canvas | 纯函数与薄壳分离；薄壳在 canvas 不可用时返回空数组 |
| OKLCH 公式抄错 | 用已知定点校验：纯白 → L≈1 C≈0；纯黑 → L≈0 |

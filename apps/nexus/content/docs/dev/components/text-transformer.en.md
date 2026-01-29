---
title: "TextTransformer 文本变换"
description: "用于在文本变化时提供平滑的过渡效果（fade + blur），适合与 `TxAutoSizer` 搭配实现“内容变化 + 尺寸跟随”的丝滑体验。"
---
# TextTransformer 文本变换

用于在文本变化时提供平滑的过渡效果（fade + blur），适合与 `TxAutoSizer` 搭配实现“内容变化 + 尺寸跟随”的丝滑体验。

> 不建议用于高频实时更新（例如逐字流式刷新、每帧变化的状态）。更适合“偶发状态切换 / 标题切换 / 章节切换 / 短句变化”等场景。

<script setup lang="ts">
import TextTransformerBasicDemo from '~/components/content/demos/TextTransformerBasicDemo.vue'
import TextTransformerBasicDemoSource from '~/components/content/demos/TextTransformerBasicDemo.vue?raw'

import AutoSizerTextTransformerDemo from '~/components/content/demos/AutoSizerTextTransformerDemo.vue'
import AutoSizerTextTransformerDemoSource from '~/components/content/demos/AutoSizerTextTransformerDemo.vue?raw'

import TextTransformerLongTextDemo from '~/components/content/demos/TextTransformerLongTextDemo.vue'
import TextTransformerLongTextDemoSource from '~/components/content/demos/TextTransformerLongTextDemo.vue?raw'

import TextTransformerTitleSubtitleDemo from '~/components/content/demos/TextTransformerTitleSubtitleDemo.vue'
import TextTransformerTitleSubtitleDemoSource from '~/components/content/demos/TextTransformerTitleSubtitleDemo.vue?raw'

import TextTransformerBadgeDemo from '~/components/content/demos/TextTransformerBadgeDemo.vue'
import TextTransformerBadgeDemoSource from '~/components/content/demos/TextTransformerBadgeDemo.vue?raw'
</script>

## 基础用法

<DemoBlock title="TextTransformer" :code="TextTransformerBasicDemoSource">
  <template #preview>
    <TextTransformerBasicDemo />
  </template>
</DemoBlock>

## 与 AutoSizer 搭配

当你希望文本变化时 **宽度/高度也平滑跟随**，建议把 `TxTextTransformer` 放进 `TxAutoSizer` 内，并通过 `autoSizerRef.action(() => ...)` 来触发一次事务切换。

如果你在尺寸动画过程中不希望文本被挤压换行（出现竖排/跳行），可以保持默认 `wrap=false`，超出部分会被裁剪（`overflow: hidden`）。

<DemoBlock title="AutoSizer + TextTransformer" :code="AutoSizerTextTransformerDemoSource">
  <template #preview>
    <AutoSizerTextTransformerDemo />
  </template>
</DemoBlock>

## 长文本/章节切换

<DemoBlock title="Long text chapter" :code="TextTransformerLongTextDemoSource">
  <template #preview>
    <TextTransformerLongTextDemo />
  </template>
</DemoBlock>

## 标题 + 副标题

<DemoBlock title="Title + subtitle" :code="TextTransformerTitleSubtitleDemoSource">
  <template #preview>
    <TextTransformerTitleSubtitleDemo />
  </template>
</DemoBlock>

## 状态/徽标文本

<DemoBlock title="Status text" :code="TextTransformerBadgeDemoSource">
  <template #preview>
    <TextTransformerBadgeDemo />
  </template>
</DemoBlock>

## API

### TxTextTransformer

#### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `text` | `string \| number` | - | 显示内容 |
| `durationMs` | `number` | `240` | 过渡时长(ms) |
| `blurPx` | `number` | `8` | blur 强度(px) |
| `tag` | `string` | `span` | 外层渲染标签 |
| `wrap` | `boolean` | `false` | 是否允许换行（长文本/包含 `\n` 的场景建议开启） |

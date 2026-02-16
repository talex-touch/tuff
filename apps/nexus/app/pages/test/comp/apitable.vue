<script setup lang="ts">
import { computed } from 'vue'
import DocApiTable from '~/components/content/DocApiTable.vue'

definePageMeta({
  layout: 'fullscreen',
  title: 'API Table Playground',
})

const { locale } = useI18n()

const pageContent = computed(() => {
  if (locale.value.startsWith('zh')) {
    return {
      title: 'API Table 交互预览',
      description: '验证 Parameter 点击复制、Type 引用跳转/枚举复制、Description 溢出展开和移动端适配表现。',
      rows: [
        {
          parameter: 'type',
          default: 'ChannelType.MAIN',
          type: {
            kind: 'ref',
            label: 'ChannelType',
            to: '/docs/dev/guide/plugin-manifest',
            preview: '点击查看 ChannelType 定义和使用方式',
          },
          description: 'Channel 类型，决定消息发送与监听所处的通信域。',
        },
        {
          parameter: 'eventName',
          default: 'plugin:example:start',
          type: 'string',
          description: '事件标识符，建议使用稳定前缀避免冲突，例如 plugin:event:start。',
        },
        {
          parameter: 'mode',
          default: 'sync',
          type: {
            kind: 'enum',
            enums: [
              { label: 'sync', description: '同步执行' },
              { label: 'async', description: '异步执行' },
              { label: 'lazy', description: '按需执行' },
            ],
          },
          description: '执行模式，支持直接点击枚举值复制。',
        },
        {
          parameter: 'payload',
          default: '-',
          type: {
            kind: 'ref',
            label: 'TuffEventPayload',
            preview: '当前版本无法直达类型页，悬浮可查看局部定义',
            snippet: `type TuffEventPayload = {
  plugin: string
  eventName: string
  data?: Record<string, unknown>
  at: number
}`,
            language: 'typescript',
          },
          description: '这是一个暂未建文档锚点的类型示例，鼠标悬浮在 Type 上会显示局部定义片段。',
        },
        {
          parameter: 'description',
          default: '""',
          type: 'string',
          description: '用于展示调用上下文的说明文本。该字段可能包含较长内容，组件默认会截断并在必要时展示“展开/收起”按钮。移动端下采用卡片布局，每条记录会拆分为 Parameter、Type、Description 三段，保证信息密度和触达效率。',
        },
      ],
    }
  }

  return {
    title: 'API Table Interaction Preview',
    description: 'Validate parameter copy, type reference jump/enum copy, description expand, and mobile adaptation.',
    rows: [
      {
        parameter: 'type',
        default: 'ChannelType.MAIN',
        type: {
          kind: 'ref',
          label: 'ChannelType',
          to: '/docs/dev/guide/plugin-manifest',
          preview: 'Open ChannelType definition',
        },
        description: 'Channel scope used by the messaging bridge.',
      },
      {
        parameter: 'eventName',
        default: 'plugin:example:start',
        type: 'string',
        description: 'Stable event identifier, for example plugin:event:start.',
      },
      {
        parameter: 'mode',
        default: 'sync',
        type: {
          kind: 'enum',
          enums: [
            { label: 'sync', description: 'Run synchronously' },
            { label: 'async', description: 'Run asynchronously' },
            { label: 'lazy', description: 'Run on demand' },
          ],
        },
        description: 'Execution mode. Every enum chip is directly copyable.',
      },
      {
        parameter: 'payload',
        default: '-',
        type: {
          kind: 'ref',
          label: 'TuffEventPayload',
          preview: 'No direct type link yet. Hover to inspect partial definition.',
          snippet: `type TuffEventPayload = {
  plugin: string
  eventName: string
  data?: Record<string, unknown>
  at: number
}`,
          language: 'typescript',
        },
        description: 'Example for non-linkable type references. Hovering the type reveals a local snippet preview.',
      },
      {
        parameter: 'description',
        default: '""',
        type: 'string',
        description: 'This field can be long in real docs. The table clamps text by default, shows an expand action when needed, and switches to a card-style layout on mobile for better readability and touch accessibility.',
      },
    ],
  }
})
</script>

<template>
  <main class="api-table-preview">
    <TxCard
      variant="plain"
      background="mask"
      shadow="soft"
      :radius="18"
      :padding="20"
      class="api-table-preview__card"
    >
      <div class="api-table-preview__header">
        <h1 class="api-table-preview__title">
          {{ pageContent.title }}
        </h1>
        <p class="api-table-preview__description">
          {{ pageContent.description }}
        </p>
      </div>

      <DocApiTable :rows="pageContent.rows" />
    </TxCard>
  </main>
</template>

<style scoped>
.api-table-preview {
  min-height: 100vh;
  padding: 32px 20px 48px;
  background:
    radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--tx-color-primary, #4f46e5) 18%, transparent) 0%, transparent 50%),
    radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--tx-color-success, #22c55e) 14%, transparent) 0%, transparent 48%),
    color-mix(in srgb, var(--tx-fill-color-lighter, #f8fafc) 85%, transparent);
}

.api-table-preview__card {
  width: min(1120px, 100%);
  margin: 0 auto;
}

.api-table-preview__header {
  margin-bottom: 18px;
}

.api-table-preview__title {
  margin: 0;
  font-size: clamp(24px, 2.7vw, 34px);
  line-height: 1.16;
  font-weight: 700;
  color: color-mix(in srgb, var(--tx-text-color-primary, #0f172a) 92%, transparent);
}

.api-table-preview__description {
  margin: 10px 0 0;
  font-size: 14px;
  line-height: 1.6;
  max-width: 920px;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #64748b) 84%, transparent);
}

@media (max-width: 900px) {
  .api-table-preview {
    padding: 16px 12px 28px;
  }

  .api-table-preview__card {
    border-radius: 14px;
  }

  .api-table-preview__description {
    font-size: 13px;
  }
}
</style>

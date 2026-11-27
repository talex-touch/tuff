<script setup lang="ts">
import { computed } from 'vue'

type ChannelTone = 'stable' | 'preview' | 'nightly' | 'neutral'

interface VersionEntry {
  id: string
  tag: string
  channel?: string
  tone?: ChannelTone
  date?: string
  note?: string
  href?: string
}

interface CapsuleTone {
  key: string
  tone: ChannelTone
  version: string
  channel: string
  historyLabel: string
  historyTitle: string
  latest: VersionEntry
}

const { locale } = useI18n()

// One capsule per channel tone: the coloured dot + channel label are the
// comparison, and each history panel reuses the same tone so a stable release
// stays visually distinct from a nightly even inside a shared list.
const capsules = computed<CapsuleTone[]>(() => {
  const zh = locale.value === 'zh'
  const historyLabel = zh ? '历史版本' : 'History'
  const historyTitle = zh ? '版本历史' : 'Version history'

  return [
    {
      key: 'stable',
      tone: 'stable',
      version: 'v2.4.12',
      channel: zh ? '稳定版' : 'STABLE',
      historyLabel,
      historyTitle,
      latest: {
        id: 's1',
        tag: 'v2.4.12',
        channel: zh ? '稳定版' : 'RELEASE',
        tone: 'stable',
        date: zh ? '6 月 23 日' : 'Jun 23',
        note: zh ? '已完成签名与回归验证的正式构建。' : 'Certified build with signing and regression complete.',
      },
    },
    {
      key: 'preview',
      tone: 'preview',
      version: 'v2.4.13-beta.19',
      channel: zh ? '测试版' : 'BETA',
      historyLabel,
      historyTitle,
      latest: {
        id: 'p1',
        tag: 'v2.4.13-beta.19',
        channel: zh ? '测试版' : 'BETA',
        tone: 'preview',
        date: zh ? '7 月 21 日' : 'Jul 21',
        note: zh ? '面向尝鲜用户的预发布通道。' : 'Preview channel for early adopters.',
      },
    },
    {
      key: 'nightly',
      tone: 'nightly',
      version: 'v2.4.14-nightly.5',
      channel: zh ? '每日构建' : 'NIGHTLY',
      historyLabel,
      historyTitle,
      latest: {
        id: 'n1',
        tag: 'v2.4.14-nightly.5',
        channel: zh ? '每日构建' : 'NIGHTLY',
        tone: 'nightly',
        date: zh ? '今天' : 'Today',
        note: zh ? '自动构建，可能不稳定。' : 'Automated build, may be unstable.',
      },
    },
    {
      key: 'neutral',
      tone: 'neutral',
      version: 'v1.9.8',
      channel: zh ? '已归档' : 'ARCHIVED',
      historyLabel,
      historyTitle,
      latest: {
        id: 'a1',
        tag: 'v1.9.8',
        channel: zh ? '已归档' : 'LEGACY',
        tone: 'neutral',
        date: '2024',
        note: zh ? '不再维护的历史版本。' : 'Legacy build, no longer maintained.',
      },
    },
  ]
})
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 14px; align-items: flex-start; padding: 8px 0; min-height: 420px;">
    <TxVersionCapsule
      v-for="item in capsules"
      :key="item.key"
      :version="item.version"
      :channel="item.channel"
      :tone="item.tone"
      :history-label="item.historyLabel"
    >
      <template #history="{ close }">
        <TxVersionHistoryPanel
          :title="item.historyTitle"
          :latest="item.latest"
          @select="close"
        />
      </template>
    </TxVersionCapsule>
  </div>
</template>

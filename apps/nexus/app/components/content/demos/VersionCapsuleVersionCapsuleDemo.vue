<script setup lang="ts">
import { computed, ref } from 'vue'

type ChannelTone = 'stable' | 'preview' | 'nightly' | 'neutral'

interface VersionBuild {
  id: string
  name: string
  meta?: string
  href?: string
  recommended?: boolean
  icon?: string
}

interface VersionNotice {
  tone?: 'warning' | 'success'
  title: string
  description?: string
  points?: string[]
}

interface VersionEntry {
  id: string
  tag: string
  channel?: string
  tone?: ChannelTone
  date?: string
  note?: string
  href?: string
}

interface CapsuleContent {
  channel: string
  historyLabel: string
  downloadLabel: string
  notice: VersionNotice
  buildsLabel: string
  downloadThis: string
  builds: VersionBuild[]
  historyTitle: string
  countLabel: string
  notesLabel: string
  latest: VersionEntry
  entries: VersionEntry[]
}

const { locale } = useI18n()

const version = 'v2.4.13-beta.19'

// Start on the download panel so the trust notice reads before the build list —
// the whole point of the redesign is that the caveats sit on the path to the file.
const openPanel = ref<'download' | 'history' | null>('download')

const content = computed<CapsuleContent>(() => {
  if (locale.value === 'zh') {
    return {
      channel: 'BETA',
      historyLabel: '历史版本',
      downloadLabel: '下载此构建',
      notice: {
        tone: 'warning',
        title: '预发布通道构建',
        description: '安装前请知悉：该版本尚未通过完整签名与回归验证。',
        points: ['功能可能随时调整', '未经过完整回归测试', '建议仅尝鲜用户使用'],
      },
      buildsLabel: '选择构建',
      downloadThis: '下载',
      builds: [
        { id: 'mac-arm', name: 'macOS · Apple 芯片', meta: '.dmg · 126 MB', href: '#mac-arm', recommended: true, icon: 'i-cib-apple' },
        { id: 'mac-x64', name: 'macOS · Intel', meta: '.dmg · 131 MB', href: '#mac-x64', icon: 'i-cib-apple' },
        { id: 'win', name: 'Windows · x64', meta: '.exe · 118 MB', href: '#win', icon: 'i-cib-windows' },
        { id: 'linux', name: 'Linux · x64', meta: '.AppImage · 140 MB', href: '#linux', icon: 'i-cib-linux' },
      ],
      historyTitle: '版本历史',
      countLabel: '共 6 个版本',
      notesLabel: '更新内容',
      latest: { id: '1', tag: 'v2.4.13-beta.19', channel: 'BETA', tone: 'preview', date: '7 月 21 日', note: '强化应用图标自愈逻辑，并修复若干构建问题。' },
      entries: [
        { id: '2', tag: 'v2.4.13-beta.18', channel: 'BETA', tone: 'preview', date: '7 月 21 日', href: '#b18' },
        { id: '3', tag: 'v2.4.12', channel: 'RELEASE', tone: 'stable', date: '7 月 12 日', href: '#v2412' },
        { id: '4', tag: 'v2.4.11', channel: 'RELEASE', tone: 'stable', date: '7 月 3 日', href: '#v2411' },
      ],
    }
  }

  return {
    channel: 'BETA',
    historyLabel: 'History',
    downloadLabel: 'Download this build',
    notice: {
      tone: 'warning',
      title: 'Preview channel build',
      description: 'Heads up: this build is not fully signed or regression-tested yet.',
      points: ['Features may change without notice', 'Not fully regression-tested', 'Recommended for early adopters only'],
    },
    buildsLabel: 'Choose a build',
    downloadThis: 'Download',
    builds: [
      { id: 'mac-arm', name: 'macOS · Apple silicon', meta: '.dmg · 126 MB', href: '#mac-arm', recommended: true, icon: 'i-cib-apple' },
      { id: 'mac-x64', name: 'macOS · Intel', meta: '.dmg · 131 MB', href: '#mac-x64', icon: 'i-cib-apple' },
      { id: 'win', name: 'Windows · x64', meta: '.exe · 118 MB', href: '#win', icon: 'i-cib-windows' },
      { id: 'linux', name: 'Linux · x64', meta: '.AppImage · 140 MB', href: '#linux', icon: 'i-cib-linux' },
    ],
    historyTitle: 'Version history',
    countLabel: '6 releases',
    notesLabel: 'What\'s new',
    latest: { id: '1', tag: 'v2.4.13-beta.19', channel: 'BETA', tone: 'preview', date: 'Jul 21', note: 'Hardened app icon self-healing and fixed several build issues.' },
    entries: [
      { id: '2', tag: 'v2.4.13-beta.18', channel: 'BETA', tone: 'preview', date: 'Jul 21', href: '#b18' },
      { id: '3', tag: 'v2.4.12', channel: 'RELEASE', tone: 'stable', date: 'Jul 12', href: '#v2412' },
      { id: '4', tag: 'v2.4.11', channel: 'RELEASE', tone: 'stable', date: 'Jul 3', href: '#v2411' },
    ],
  }
})
</script>

<template>
  <div style="display: flex; justify-content: center; padding: 8px 0; min-height: 470px;">
    <TxVersionCapsule
      v-model:panel="openPanel"
      :version="version"
      :channel="content.channel"
      tone="preview"
      :history-label="content.historyLabel"
      :download-label="content.downloadLabel"
    >
      <template #download="{ close }">
        <TxVersionDownloadPanel
          :notice="content.notice"
          :builds="content.builds"
          :builds-label="content.buildsLabel"
          :download-label="content.downloadThis"
          @select="close"
        />
      </template>

      <template #history="{ close }">
        <TxVersionHistoryPanel
          :title="content.historyTitle"
          :latest="content.latest"
          :entries="content.entries"
          :count-label="content.countLabel"
          :notes-label="content.notesLabel"
          @select="close"
        />
      </template>
    </TxVersionCapsule>
  </div>
</template>

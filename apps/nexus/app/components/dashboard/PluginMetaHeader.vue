<script setup lang="ts">
import type { DashboardArtifactType, PluginChannel, PluginStatus } from '~/types/dashboard-plugin'
import { TxPluginMetaHeader } from '@talex-touch/tuff-business'
import StatusBadge from '~/components/ui/StatusBadge.vue'

interface PluginMetaHeaderVersion {
  channel: PluginChannel
  version: string
  createdAt?: string | null
}

interface PluginMetaHeaderPlugin {
  id: string
  slug: string
  name: string
  summary?: string | null
  category: string
  installs: number
  isOfficial: boolean
  artifactType?: DashboardArtifactType | null
  status?: PluginStatus | null
  iconUrl?: string | null
  author?: { name: string, avatarColor?: string } | null
  latestVersion?: PluginMetaHeaderVersion | null
}

interface Props {
  plugin: PluginMetaHeaderPlugin
  categoryLabel?: string
}

const props = defineProps<Props>()
const { t, locale } = useI18n()

const localeTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const numberFormatter = computed(() => new Intl.NumberFormat(localeTag.value))
const isZh = computed(() => locale.value.startsWith('zh'))

function formatInstalls(count: number) {
  return numberFormatter.value.format(count)
}

function statusTone(status: PluginStatus) {
  switch (status) {
    case 'approved':
      return 'success'
    case 'pending':
      return 'warning'
    case 'rejected':
      return 'danger'
    default:
      return 'muted'
  }
}

function channelTone(channel: PluginChannel) {
  switch (channel) {
    case 'RELEASE':
      return 'success'
    case 'BETA':
      return 'warning'
    default:
      return 'muted'
  }
}

function resolveArtifactTypeLabel(type?: DashboardArtifactType | null) {
  const artifactType = type ?? 'plugin'
  return t(`dashboard.sections.plugins.form.artifactTypes.${artifactType}`, artifactType)
}

const updatedLabel = computed(() => (isZh.value ? '更新于' : 'Updated'))

function formatDate(value?: string | null) {
  if (!value)
    return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()))
    return value
  return new Intl.DateTimeFormat(localeTag.value, { dateStyle: 'medium' }).format(parsed)
}

const latestUpdatedText = computed(() => {
  const value = formatDate(props.plugin.latestVersion?.createdAt)
  if (!value)
    return ''
  return `${updatedLabel.value} ${value}`
})

const metaItems = computed(() => {
  const items: string[] = [
    resolveArtifactTypeLabel(props.plugin.artifactType),
    props.categoryLabel || props.plugin.category
  ]

  if (props.plugin.author?.name) {
    items.push(props.plugin.author.name)
  }

  items.push(`${formatInstalls(props.plugin.installs)} ${isZh.value ? '安装' : 'installs'}`)

  if (latestUpdatedText.value) {
    items.push(latestUpdatedText.value)
  }

  return items
})
</script>

<template>
  <TxPluginMetaHeader
    class="PluginMetaHeader"
    :title="plugin.name"
    :subtitle="plugin.slug"
    :description="plugin.summary"
    :meta-items="metaItems"
    :icon-url="plugin.iconUrl"
    :icon-alt="plugin.name"
    :official="false"
  >
    <template #title-extra>
      <span
        v-if="plugin.isOfficial"
        class="i-carbon-certificate PluginMetaHeader-OfficialMark"
        :title="t('dashboard.sections.plugins.officialBadge')"
      />
    </template>
    <template #badges>
      <StatusBadge
        v-if="plugin.status"
        :text="t(`dashboard.sections.plugins.statuses.${plugin.status}`)"
        :status="statusTone(plugin.status as PluginStatus)"
        size="sm"
      />
      <StatusBadge
        v-if="plugin.latestVersion"
        :text="`v${plugin.latestVersion.version}`"
        :status="channelTone(plugin.latestVersion.channel)"
        size="sm"
      />
    </template>
  </TxPluginMetaHeader>
</template>

<style scoped>
.PluginMetaHeader-OfficialMark {
  flex-shrink: 0;
  color: color-mix(in srgb, var(--tx-color-warning, #f59e0b) 88%, #f59e0b);
}

@media (max-width: 720px) {
  :deep(.TxPluginMetaHeader-Description) {
    margin-top: 6px;
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
}
</style>

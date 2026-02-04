<script setup lang="ts">
import type { SharedPluginDetail } from '../plugin-detail'
import { computed } from 'vue'
import SharedPluginDetailHeader from './SharedPluginDetailHeader.vue'
import SharedPluginDetailMetaList from './SharedPluginDetailMetaList.vue'
import SharedPluginDetailReadme from './SharedPluginDetailReadme.vue'
import SharedPluginDetailVersions from './SharedPluginDetailVersions.vue'

interface Props {
  detail: SharedPluginDetail
  showMeta?: boolean
  showReadme?: boolean
  showVersions?: boolean
  readmeTitle?: string
  versionsTitle?: string
  metaTitle?: string
  emptyReadmeText?: string
  emptyVersionsText?: string
  renderMarkdown?: (markdown: string) => string
  formatDate?: (value: string | number | Date) => string
  formatNumber?: (value: number) => string
  formatSize?: (value: number) => string
  installsText?: string
  versionText?: string
  updatedText?: string
  officialLabel?: string
  installsLabel?: string
  versionLabel?: string
  updatedLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  showMeta: true,
  showReadme: true,
  showVersions: true,
  readmeTitle: 'README',
  versionsTitle: 'Versions',
  metaTitle: '',
  emptyReadmeText: 'No README',
  emptyVersionsText: 'No versions'
})

const hasMeta = computed(() => (props.detail.metaItems?.length ?? 0) > 0)
</script>

<template>
  <div class="space-y-6">
    <SharedPluginDetailHeader
      :detail="detail"
      :format-date="formatDate"
      :format-number="formatNumber"
      :installs-text="installsText"
      :version-text="versionText"
      :updated-text="updatedText"
      :official-label="officialLabel"
      :installs-label="installsLabel"
      :version-label="versionLabel"
      :updated-label="updatedLabel"
    />

    <div class="flex flex-col gap-6 lg:flex-row">
      <div class="min-w-0 flex-1 space-y-6">
        <SharedPluginDetailReadme
          v-if="showReadme"
          :readme="detail.readme"
          :title="readmeTitle"
          :empty-text="emptyReadmeText"
          :render-markdown="renderMarkdown"
        />
        <SharedPluginDetailVersions
          v-if="showVersions"
          :versions="detail.versions"
          :title="versionsTitle"
          :empty-text="emptyVersionsText"
          :format-date="formatDate"
          :format-size="formatSize"
        />
      </div>
      <aside v-if="showMeta && hasMeta" class="w-full lg:w-64">
        <SharedPluginDetailMetaList :items="detail.metaItems" :title="metaTitle" />
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts" name="TagSection">
import type { IBoxOptions } from '../../../modules/box/adapter'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { BoxMode } from '../../../modules/box/adapter'
import ClipboardImageTag from './ClipboardImageTag.vue'
import UnifiedFileTag from './UnifiedFileTag.vue'

const props = defineProps<{
  boxOptions: IBoxOptions
  clipboardOptions: any
}>()

const { t } = useI18n()

const TAG_LABEL_KEYS: Record<string, string> = {
  url: 'tagSection.tags.url',
  api_key: 'tagSection.tags.api_key',
  token: 'tagSection.tags.token',
  password: 'tagSection.tags.password',
  account: 'tagSection.tags.account',
  email: 'tagSection.tags.email'
}

// Truncate clipboard content for display (text only)
const clipboardPreview = computed(() => {
  if (!props.clipboardOptions.last) return ''

  const data = props.clipboardOptions.last
  let preview = ''
  let totalLength = 0

  if (data.type === 'text') {
    preview = data.content || ''
    totalLength = preview.length
  } else if (data.type === 'html') {
    preview = data.content || '' // Plain text version
    totalLength = preview.length
  }

  if (!preview) return ''

  // If text is too long, truncate and show character count
  const maxLength = 30
  if (totalLength > maxLength) {
    return `${preview.substring(0, maxLength)}... 共${totalLength}字`
  }
  return preview
})

const clipboardTagChips = computed(() => {
  const last = props.clipboardOptions.last
  if (!last) return { items: [] as Array<{ key: string; label: string }>, extraCount: 0 }

  const items: Array<{ key: string; label: string }> = []
  const sourceApp = typeof last.sourceApp === 'string' ? last.sourceApp.trim() : ''
  if (sourceApp) {
    items.push({
      key: `source:${sourceApp}`,
      label: t('tagSection.fromApp', { app: sourceApp })
    })
  }

  const rawTags = Array.isArray(last.meta?.tags) ? (last.meta?.tags as unknown[]) : []
  const normalizedTags = rawTags.filter(
    (tag): tag is string => typeof tag === 'string' && tag.length > 0
  )
  const uniqueTags = Array.from(new Set(normalizedTags))
  for (const tag of uniqueTags) {
    const labelKey = TAG_LABEL_KEYS[tag]
    const label = labelKey ? t(labelKey) : tag
    items.push({
      key: `tag:${tag}`,
      label: label === labelKey ? tag : label
    })
  }

  const maxTags = 3
  const visibleItems = items.slice(0, maxTags)
  return {
    items: visibleItems,
    extraCount: Math.max(items.length - visibleItems.length, 0)
  }
})

// Determine which tag to show based on priority: image > file > text
const activeTag = computed(() => {
  // Priority 1: Image (clipboard image)
  if (props.clipboardOptions.last?.type === 'image') {
    return { type: 'clipboard-image', data: props.clipboardOptions.last }
  }

  // Priority 2: Files (FILE mode or clipboard files - unified)
  if (props.boxOptions.mode === BoxMode.FILE && props.boxOptions.file?.paths?.length > 0) {
    return {
      type: 'file',
      iconPath: props.boxOptions.file.iconPath,
      paths: props.boxOptions.file.paths,
      clipboardData: null
    }
  }
  if (props.clipboardOptions.last?.type === 'files') {
    return {
      type: 'file',
      iconPath: null,
      paths: null,
      clipboardData: props.clipboardOptions.last
    }
  }

  // Priority 3: Text (clipboard text/html)
  if (
    props.clipboardOptions.last?.type === 'text' ||
    props.clipboardOptions.last?.type === 'html'
  ) {
    return { type: 'clipboard-text', data: props.clipboardOptions.last }
  }

  // Other modes
  if (props.boxOptions.mode === BoxMode.COMMAND) {
    return { type: 'command' }
  }

  return null
})
</script>

<template>
  <!-- Tag section (shown when not in FEATURE mode) -->
  <div v-if="boxOptions.mode !== BoxMode.FEATURE && activeTag" class="CoreBox-Tag">
    <!-- Image clipboard (highest priority) -->
    <ClipboardImageTag v-if="activeTag.type === 'clipboard-image'" :data="activeTag.data" />

    <!-- Unified file tag (FILE mode + clipboard files) -->
    <UnifiedFileTag
      v-else-if="activeTag.type === 'file'"
      :icon-path="activeTag.iconPath"
      :paths="activeTag.paths"
      :clipboard-data="activeTag.clipboardData"
    />

    <!-- Text/HTML clipboard -->
    <span
      v-else-if="activeTag.type === 'clipboard-text'"
      class="fake-background dotted"
      :title="activeTag.data?.content"
    >
      <template v-if="activeTag.data?.type === 'text'">📝</template>
      <template v-else>💻</template>
      {{ clipboardPreview }}
    </span>

    <!-- Command tag -->
    <span v-else-if="activeTag.type === 'command'" class="fake-background">
      {{ t('tagSection.command') }}
    </span>

    <div v-if="clipboardTagChips.items.length" class="CoreBox-TagList">
      <span
        v-for="item in clipboardTagChips.items"
        :key="item.key"
        class="fake-background tag-chip"
        :title="item.label"
      >
        {{ item.label }}
      </span>
      <span v-if="clipboardTagChips.extraCount > 0" class="fake-background tag-chip">
        +{{ clipboardTagChips.extraCount }}
      </span>
    </div>
  </div>
</template>

<style lang="scss">
/** Tag styles */
.CoreBox-Tag {
  position: relative;
  display: flex;

  min-width: 64px;
  width: max-content;
  max-width: 360px;
  height: 60px;

  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  // right: 20px;
  top: 0;

  justify-content: flex-end;
  align-items: center;

  user-select: none;

  /** Tag text styles */
  span {
    padding: 2px 4px;
    font-size: 15px;

    --fake-inner-opacity: 0.5 !important;
    --fake-color: var(--el-color-primary);
    border-radius: 8px;
    // background-color: var(--el-color-warning-light-5);
  }
}

.CoreBox-TagList {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;

  .tag-chip {
    padding: 2px 6px;
    font-size: 12px;
    --fake-inner-opacity: 0.4 !important;
  }
}
</style>

<script setup lang="ts" name="TagSection">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FileTag from './FileTag.vue'
import ClipboardImageTag from './ClipboardImageTag.vue'
import ClipboardFileTag from './ClipboardFileTag.vue'
import { BoxMode, IBoxOptions } from '../../../modules/box/adapter'

const { t } = useI18n()

const props = defineProps<{
  boxOptions: IBoxOptions
  clipboardOptions: any
}>()

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
    return preview.substring(0, maxLength) + `... 共${totalLength}字`
  }
  return preview
})

// Determine which tag to show based on priority: image > file > text
// This matches the logic in useSearch.ts for building TuffQuery
const activeTag = computed(() => {
  // Priority 1: Image (clipboard image)
  if (props.clipboardOptions.last?.type === 'image') {
    return { type: 'clipboard-image', data: props.clipboardOptions.last }
  }

  // Priority 2: File (FILE mode or clipboard files)
  if (props.boxOptions.mode === BoxMode.FILE && props.boxOptions.file?.paths?.length > 0) {
    return {
      type: 'file',
      iconPath: props.boxOptions.file.iconPath,
      paths: props.boxOptions.file.paths
    }
  }
  if (props.clipboardOptions.last?.type === 'files') {
    return { type: 'clipboard-files', data: props.clipboardOptions.last }
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
    <ClipboardImageTag
      v-if="activeTag && activeTag.type === 'clipboard-image'"
      :data="activeTag.data"
    />

    <!-- File tag (FILE mode) -->
    <FileTag
      v-else-if="activeTag && activeTag.type === 'file'"
      :icon-path="activeTag.iconPath"
      :paths="activeTag.paths || []"
    />

    <!-- Files clipboard -->
    <ClipboardFileTag
      v-else-if="activeTag && activeTag.type === 'clipboard-files'"
      :data="activeTag.data"
    />

    <!-- Text/HTML clipboard -->
    <span
      v-else-if="activeTag && activeTag.type === 'clipboard-text'"
      class="fake-background dotted"
      :title="activeTag.data?.content"
    >
      <template v-if="activeTag.data?.type === 'text'">📝</template>
      <template v-else>💻</template>
      {{ clipboardPreview }}
    </span>

    <!-- Command tag -->
    <span v-else-if="activeTag && activeTag.type === 'command'" class="fake-background">
      {{ t('tagSection.command') }}
    </span>
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
</style>

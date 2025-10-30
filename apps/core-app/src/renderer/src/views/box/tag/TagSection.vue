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

  if (data.type === 'text') {
    preview = data.content || ''
  } else if (data.type === 'html') {
    preview = data.content || '' // Plain text version
  }

  // Truncate to 50 characters
  if (preview.length > 50) {
    return preview.substring(0, 50) + '...'
  }
  return preview
})
</script>

<template>
  <!-- Tag section (shown when not in FEATURE mode) -->
  <div v-if="boxOptions.mode !== BoxMode.FEATURE" class="CoreBox-Tag">
    <!-- Clipboard tag -->
    <template v-if="clipboardOptions.last">
      <!-- Text clipboard -->
      <span v-if="clipboardOptions.last?.type === 'text'" class="fake-background dotted" :title="clipboardOptions.last.content">
        📝 {{ clipboardPreview }}
      </span>

      <!-- Image clipboard -->
      <ClipboardImageTag
        v-else-if="clipboardOptions.last?.type === 'image'"
        :data="clipboardOptions.last"
      />

      <!-- Files clipboard -->
      <ClipboardFileTag
        v-else-if="clipboardOptions.last?.type === 'files'"
        :data="clipboardOptions.last"
      />

      <!-- HTML clipboard -->
      <span v-else-if="clipboardOptions.last?.type === 'html'" class="fake-background dotted" :title="clipboardOptions.last.content">
        💻 {{ clipboardPreview }}
      </span>
    </template>

    <!-- File tag -->
    <template v-if="boxOptions.mode === BoxMode.FILE">
      <FileTag :buffer="boxOptions.file.buffer!" :paths="boxOptions.file.paths" />
    </template>

    <!-- Image tag -->
    <template v-else-if="boxOptions.mode === BoxMode.IMAGE"> </template>

    <!-- Command tag -->
    <template v-else-if="boxOptions.mode === BoxMode.COMMAND">
      <span class="fake-background">{{ t('tagSection.command') }}</span>
    </template>
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

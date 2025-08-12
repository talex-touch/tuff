<script setup lang="ts" name="TagSection">
import FileTag from './FileTag.vue'
import { BoxMode, IBoxOptions } from '../../../modules/box/adapter'

defineProps<{
  boxOptions: IBoxOptions
  clipboardOptions: any
}>()
</script>

<template>
  <!-- Tag section (shown when not in FEATURE mode) -->
  <div v-if="boxOptions.mode !== BoxMode.FEATURE" class="CoreBox-Tag">
    <!-- Clipboard tag -->
    <template v-if="clipboardOptions.last">
      <span v-if="clipboardOptions.last?.type === 'text'" class="fake-background dotted">
        Copied Text
      </span>
      <span v-else-if="clipboardOptions.last?.type === 'image'" class="fake-background dotted">
        Copied Image
      </span>
      <span v-else-if="clipboardOptions.last?.type === 'html'" class="fake-background dotted">
        Copied Html
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
      <span class="fake-background">COMMAND</span>
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

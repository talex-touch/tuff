<script name="FileTag" setup lang="ts">
import path from 'path-browserify'
import { buildTfileUrl } from '~/utils/tfile-url'

const props = defineProps<{
  iconPath?: string
  paths: string[]
}>()

const image = computed(() => {
  // Use tfile:// protocol if available
  if (props.iconPath) {
    return buildTfileUrl(props.iconPath)
  }

  // Fallback to first path
  if (props.paths && props.paths.length > 0) {
    return buildTfileUrl(props.paths[0])
  }

  return ''
})

const firstFileName = computed(() => {
  const [firstPath] = props.paths

  return path.basename(firstPath || '')
})

const fileLength = computed(() => props?.paths.length || 0)
</script>

<template>
  <div class="FileTag">
    <img :src="image" alt="" />
    <span class="name">{{ firstFileName }}</span>
    <span v-if="fileLength - 1" class="badge" v-text="fileLength" />
  </div>
</template>

<style lang="scss">
.FileTag {
  .name {
    flex: 1;

    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    display: flex;
    padding: 0.25rem;

    align-items: center;
    justify-content: center;

    right: 0.5rem;

    min-width: 24px;
    height: 24px;

    border-radius: 12px;
    background-color: var(--el-fill-color);
  }
  img {
    margin-top: 0.25rem;

    height: 24px;
  }
  position: relative;
  display: flex;
  gap: 0.25rem;

  padding: 0.25rem 0.5rem;

  width: 100%;
  align-items: center;

  color: var(--el-text-color);
  border-radius: 8px;
  box-sizing: border-box;
  border: 1px solid currentColor;
}
</style>

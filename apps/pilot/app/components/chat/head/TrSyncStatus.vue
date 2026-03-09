<script lang="ts" setup>
import TextShaving from '~/components/other/TextShaving.vue'
import * as C from '~/composables/api/base/v1/aigc/completion-types'

const props = defineProps < {
  status: C.PersistStatus
}>()

const emits = defineEmits <{
  (e: 'upload'): void
}>()

const sync = computed(() => props.status === C.PersistStatus.SUCCESS)
const syncing = computed(() => props.status === C.PersistStatus.PENDING)
const failed = computed(() => props.status === C.PersistStatus.FAILED)
const modified = computed(() => props.status === C.PersistStatus.MODIFIED)
</script>

<template>
  <span
    :class="{ cursorPointer: failed || modified, shining: syncing, error: failed, warning: syncing || modified, syncing, sync }"
    class="tag TrSyncStatus"
    @click="emits('upload')"
  >
    <template v-if="syncing">
      <i i-carbon:renew block class="sync-loading-icon" />
      正在同步
    </template>
    <template v-else-if="sync">
      <i i-carbon:checkmark block />
      已同步
    </template>
    <template v-else-if="failed">
      <i i-carbon:close block />
      同步失败
    </template>
    <template v-else>
      <i i-carbon:information block />
      未同步
    </template>

  </span>
</template>

<style style="scss">
.sync-loading-icon {
  animation: loading_rotate 0.5s infinite;
}

@keyframes loading_rotate {
  to {
    transform: rotate(360deg);
  }
}

.TrSyncStatus {
  &.cursorPointer {
    cursor: pointer;
  }
  position: relative;
  display: flex;
  padding: 0.25rem;

  align-items: center;

  opacity: 1;
  overflow: hidden;
  color: var(--el-text-color-primary);
  /* box-shadow: var(--el-box-shadow); */
  /* backdrop-filter: blur(16px) saturate(180%); */
  transition: 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);
}

/* .mobile .TrSyncStatus {
  z-index: 5;
  position: absolute;
  padding: 0;

  top: 0;
  left: 0;

  width: 100%;
  height: 2px;

  opacity: 1;
  border-radius: 0;
  box-shadow: unset;
  backdrop-filter: unset;

  background-color: var(--el-color-danger);

  &.sync {
    background-color: var(--el-color-success);
  }

  &.syncing {
    animation: head_shining 1s infinite;
    background-color: var(--el-color-primary);
  }
} */

@keyframes head_shining {
  0% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.5;
  }
}
</style>

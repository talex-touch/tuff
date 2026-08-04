<script lang="ts" name="ShellSearchEntry" setup>
withDefaults(
  defineProps<{
    placeholder: string
    /** Keyboard hint rendered on the right, e.g. `⌘E`. Omit to hide. */
    kbd?: string
  }>(),
  { kbd: undefined }
)

defineEmits<{ activate: [] }>()
</script>

<template>
  <button class="ShellSearchEntry" type="button" @click="$emit('activate')">
    <span class="ShellSearchEntry-Icon i-ri-search-line" />
    <span class="ShellSearchEntry-Placeholder">{{ placeholder }}</span>
    <span v-if="kbd" class="ShellSearchEntry-Kbd">{{ kbd }}</span>
  </button>
</template>

<style lang="scss" scoped>
.ShellSearchEntry {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-md);
  background: var(--shell-bg);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease;
  -webkit-app-region: no-drag;

  &:hover {
    border-color: var(--shell-border-strong);
  }
}

.ShellSearchEntry-Icon {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  color: var(--shell-text-muted);
}

.ShellSearchEntry-Placeholder {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--shell-text-muted);
  font-size: 12.5px;
}

.ShellSearchEntry-Kbd {
  flex: 0 0 auto;
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--shell-surface-2);
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
}
</style>

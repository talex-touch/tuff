<script lang="ts" name="ShellNavGroup" setup>
defineProps<{
  /** Small muted group heading, e.g. `偏好` or a conversation time bucket. */
  label: string
}>()
</script>

<template>
  <div class="ShellNavGroup">
    <div class="ShellNavGroup-LabelWrap">
      <span class="ShellNavGroup-Label">{{ label }}</span>
    </div>
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.ShellNavGroup {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
}

.ShellNavGroup-LabelWrap {
  padding: 8px 10px 4px;

  // No room for a heading in rail mode; the group's items stay, separated by the gap alone.
  .is-rail & {
    display: none;
  }
}

.ShellNavGroup-Label {
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  letter-spacing: 0.4px;
}
</style>

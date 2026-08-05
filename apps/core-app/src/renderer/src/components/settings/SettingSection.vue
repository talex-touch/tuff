<script lang="ts" name="SettingSection" setup>
withDefaults(
  defineProps<{
    /** Small muted section label. Omit for an unlabelled card. */
    label?: string
    /**
     * `card` wraps children in the hairline-bordered container. `bare` drops it, for sections
     * that host a component supplying its own surface.
     */
    variant?: 'card' | 'bare'
  }>(),
  { label: undefined, variant: 'card' }
)
</script>

<template>
  <section class="SettingSection">
    <div v-if="label" class="SettingSection-LabelWrap">
      <span class="SettingSection-Label">{{ label }}</span>
    </div>
    <div class="SettingSection-Body" :class="`variant-${variant}`">
      <slot />
    </div>
  </section>
</template>

<style lang="scss" scoped>
.SettingSection {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.SettingSection-LabelWrap {
  padding-left: 2px;
}

.SettingSection-Label {
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
  letter-spacing: 0.2px;
}

.SettingSection-Body {
  display: flex;
  flex-direction: column;
  width: 100%;

  &.variant-card {
    overflow: hidden;
    border: 1px solid var(--shell-border);
    border-radius: var(--shell-radius-lg);
    background: var(--shell-bg);
  }
}
</style>

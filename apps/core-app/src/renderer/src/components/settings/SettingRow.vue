<script lang="ts" name="SettingRow" setup>
withDefaults(
  defineProps<{
    title: string
    description?: string
    /** Right-aligned value text, rendered before the `trailing` slot. */
    value?: string
    /** Draws a chevron and makes the whole row clickable. */
    navigable?: boolean
  }>(),
  { description: undefined, value: undefined, navigable: false }
)

defineEmits<{ activate: [] }>()
</script>

<template>
  <div class="SettingRow" :class="{ navigable }">
    <!--
      A stretched hit area rather than wrapping the row in a `<button>`: the trailing slot
      carries toggles and buttons, and nesting interactive elements inside a button is invalid
      HTML that breaks keyboard and screen-reader behaviour.
    -->
    <button
      v-if="navigable"
      class="SettingRow-Hit"
      type="button"
      :aria-label="title"
      @click="$emit('activate')"
    />

    <div class="SettingRow-Text">
      <span class="SettingRow-Title">{{ title }}</span>
      <span v-if="description" class="SettingRow-Desc">{{ description }}</span>
    </div>

    <div class="SettingRow-Trailing">
      <span v-if="value" class="SettingRow-Value">{{ value }}</span>
      <slot name="trailing" />
      <span v-if="navigable" class="SettingRow-Chevron i-ri-arrow-right-s-line" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.SettingRow {
  position: relative;
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 16px;
  border: none;
  background: transparent;
  font-family: inherit;
  text-align: left;
  box-sizing: border-box;

  &.navigable {
    transition: background-color 0.15s ease;

    &:hover {
      background: var(--shell-surface);
    }
  }
}

.SettingRow-Hit {
  z-index: 0;
  position: absolute;
  inset: 0;
  border: none;
  background: transparent;
  cursor: pointer;

  /*
   * The row spans the full width of a `SettingSection` card, which clips its overflow, so the
   * global outward focus ring would be cut off at the card edges. Draw it inside instead. The
   * neutral band is dropped with it: the card interior is a known flat surface, so the accent
   * ring already has the contrast it needs.
   */
  &:focus-visible {
    outline-offset: -3px;
    box-shadow: none;
  }
}

.SettingRow-Text {
  z-index: 1;
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  pointer-events: none;
}

.SettingRow-Title {
  color: var(--shell-text-primary);
  font-size: 13.5px;
}

.SettingRow-Desc {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
}

.SettingRow-Trailing {
  z-index: 1;
  position: relative;
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
  align-items: center;
}

.SettingRow-Value {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-body);
}

.SettingRow-Chevron {
  width: 14px;
  height: 14px;
  color: var(--shell-text-muted);
}
</style>

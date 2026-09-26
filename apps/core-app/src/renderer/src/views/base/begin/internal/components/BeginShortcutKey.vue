<script setup lang="ts" name="BeginShortcutKey">
withDefaults(
  defineProps<{
    label?: string
    /**
     * Printed in the key's corner, as a Mac keyboard prints ⌘ above "command". Letter keys and
     * non-Mac modifiers have none.
     */
    symbol?: string
    active?: boolean
    success?: boolean
  }>(),
  {
    label: 'command',
    symbol: undefined,
    active: false,
    success: false
  }
)
</script>

<template>
  <button
    class="BeginShortcutKey"
    :class="{ 'is-active': active, 'is-success': success }"
    type="button"
    :aria-pressed="active"
  >
    <div class="BeginShortcutKey-Content">
      <span v-if="symbol" class="BeginShortcutKey-Icon" aria-hidden="true">{{ symbol }}</span>
      <p class="BeginShortcutKey-Text">{{ label }}</p>
    </div>
  </button>
</template>

<style scoped lang="scss">
.BeginShortcutKey {
  position: relative;
  width: 84px;
  height: 84px;
  padding: 0;
  border: 1px solid var(--tx-border-color-light);
  border-radius: 16px;
  outline: none;
  background: var(--tx-bg-color-page);
  box-shadow:
    -3px -8px 10px color-mix(in srgb, var(--tx-color-white) 88%, transparent),
    3px 8px 10px color-mix(in srgb, var(--tx-text-color-primary) 16%, transparent);
  transition:
    transform 0.25s ease,
    box-shadow 0.25s ease;
  cursor: default;
}

.BeginShortcutKey:hover {
  transform: translateY(-2px);
  box-shadow:
    -3px -10px 12px color-mix(in srgb, var(--tx-color-white) 90%, transparent),
    4px 10px 14px color-mix(in srgb, var(--tx-text-color-primary) 20%, transparent);
}

.BeginShortcutKey:active {
  transform: translateY(0);
}

.BeginShortcutKey.is-active {
  transform: translateY(0) scale(0.95);
  box-shadow: none;
}

.BeginShortcutKey.is-success {
  border-color: var(--tx-color-success);
  box-shadow:
    -2px -7px 10px color-mix(in srgb, var(--tx-color-white) 86%, transparent),
    0 0 0 2px color-mix(in srgb, var(--tx-color-success) 26%, transparent),
    0 0 18px color-mix(in srgb, var(--tx-color-success) 42%, transparent);
}

.BeginShortcutKey-Content {
  position: relative;
  display: grid;
  width: 100%;
  height: 100%;
  padding: 10px;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(2, 1fr);
  border-radius: 16px;
  box-shadow:
    inset 0 -3px 0 color-mix(in srgb, var(--tx-fill-color) 92%, var(--tx-text-color-primary)),
    0 -3px 0 var(--tx-bg-color-page);
}

.BeginShortcutKey-Icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  align-self: start;
  justify-self: end;
  grid-column: 4;
  color: color-mix(in srgb, var(--tx-text-color-secondary) 84%, var(--tx-text-color-regular));
  // Sized to match the 16px ⌘ drawing this box used to hold: a glyph's ink is well inside its em.
  font-size: 20px;
  line-height: 1;
  transform: translate3d(0, -2px, 0);
  transition: transform 0.25s ease;
}

.BeginShortcutKey:hover .BeginShortcutKey-Icon {
  transform: translate3d(0, -6px, 0);
}

.BeginShortcutKey.is-active .BeginShortcutKey-Icon {
  transform: translate3d(0, -1px, 0);
}

.BeginShortcutKey-Text {
  margin: 0;
  align-self: end;
  grid-column: 1 / 5;
  grid-row: 2;
  text-align: center;
  font-size: 0.85rem;
  font-weight: 600;
  color: color-mix(in srgb, var(--tx-text-color-primary) 82%, var(--tx-text-color-regular));
  transform: translate3d(0, -2px, 0);
  transition: transform 0.25s ease;
}

.BeginShortcutKey:hover .BeginShortcutKey-Text {
  transform: translate3d(0, -4px, 0);
}

.BeginShortcutKey.is-active .BeginShortcutKey-Text {
  transform: translate3d(0, -1px, 0);
}

.BeginShortcutKey.is-success .BeginShortcutKey-Text {
  color: color-mix(in srgb, var(--tx-color-success) 70%, var(--tx-text-color-primary) 30%);
}
</style>

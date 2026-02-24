<script setup lang="ts" name="BeginShortcutKey">
withDefaults(
  defineProps<{
    label?: string
    active?: boolean
    success?: boolean
  }>(),
  {
    label: 'command',
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
      <div class="BeginShortcutKey-Icon" aria-hidden="true">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 80 80"
          width="16"
          height="16"
          xml:space="preserve"
        >
          <g>
            <path
              d="M64,48L64,48h-8V32h8c8.836,0,16-7.164,16-16S72.836,0,64,0c-8.837,0-16,7.164-16,16v8H32v-8c0-8.836-7.164-16-16-16S0,7.164,0,16s7.164,16,16,16h8v16h-8l0,0l0,0C7.164,48,0,55.164,0,64s7.164,16,16,16c8.837,0,16-7.164,16-16l0,0v-8h16v7.98c0,0.008-0.001,0.014-0.001,0.02c0,8.836,7.164,16,16,16s16-7.164,16-16S72.836,48.002,64,48z M64,8c4.418,0,8,3.582,8,8s-3.582,8-8,8h-8v-8C56,11.582,59.582,8,64,8z M8,16c0-4.418,3.582-8,8-8s8,3.582,8,8v8h-8C11.582,24,8,20.417,8,16z M16,72c-4.418,0-8-3.582-8-8s3.582-8,8-8l0,0h8v8C24,68.418,20.418,72,16,72z M32,48V32h16v16H32z M64,72c-4.418,0-8-3.582-8-8l0,0v-8h7.999c4.418,0,8,3.582,8,8S68.418,72,64,72z"
            />
          </g>
        </svg>
      </div>
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
  width: 16px;
  height: 16px;
  align-self: start;
  justify-self: end;
  grid-column: 4;
  transform: translate3d(0, -2px, 0);
  transition: transform 0.25s ease;
}

.BeginShortcutKey:hover .BeginShortcutKey-Icon {
  transform: translate3d(0, -6px, 0);
}

.BeginShortcutKey.is-active .BeginShortcutKey-Icon {
  transform: translate3d(0, -1px, 0);
}

.BeginShortcutKey-Icon svg {
  width: 16px;
  height: 16px;
  fill: color-mix(in srgb, var(--tx-text-color-secondary) 84%, var(--tx-text-color-regular));
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

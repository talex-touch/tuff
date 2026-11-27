<script setup lang="ts">
// The small CoreBox window the Onboarding template draws twice: in the live
// preview column and on the last step. `dark` / `light` force its theme
// whatever the page's, so the Theme preference shows up here. Decorative: the
// template states every setting it reflects in text beside it.
//
// Forced through `data-theme`, not the `.dark` class: tuffex swaps its tokens
// for either, but the class would also switch UnoCSS `dark:` variants and
// match the site's own `.dark …` rules inside the window.
defineProps<{
  placeholder: string
  keys: string
  rows: Array<{ title: string, kind: string, icon: string }>
  dark?: boolean
  light?: boolean
}>()
</script>

<template>
  <!-- `data-theme="dark"` swaps the tuffex tokens for this subtree; a forced
       light window on a dark page swaps ink and surface below instead, since
       no token block restores light values under a dark page. -->
  <div class="onb-mini" :data-theme="dark ? 'dark' : light ? 'light' : undefined" aria-hidden="true">
    <TxGlassSurface width="100%" height="100%" :border-radius="14" :blur="12" :saturation="1.4">
      <div class="onb-mini__panel">
        <div class="onb-mini__input">
          <TxIconChip :size="18" :radius="5" tone="ink" :font-size="10">
            T
          </TxIconChip>
          <span class="onb-mini__placeholder">{{ placeholder }}</span>
          <span class="onb-mini__keys">{{ keys }}</span>
        </div>
        <ul class="onb-mini__list">
          <li v-for="(row, index) in rows" :key="row.title" :class="{ 'is-active': index === 0 }">
            <i :class="row.icon" />
            <span class="onb-mini__title">{{ row.title }}</span>
            <span class="onb-mini__kind">{{ row.kind }}</span>
          </li>
        </ul>
      </div>
    </TxGlassSurface>
  </div>
</template>

<style scoped>
.onb-mini {
  --mini-surface: var(--tx-bg-color, #ffffff);
  --mini-ink: var(--tx-text-color-primary, #303133);
  --mini-muted: var(--tx-text-color-secondary, #909399);
  --mini-line: var(--tx-border-color-lighter, #ebeef5);

  width: 100%;
  height: 164px;
  border-radius: 14px;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--mini-ink) 12%, transparent),
    var(--tx-elevation-4, 4px 8px 24px rgba(0, 0, 0, 0.08));
  color: var(--mini-ink);
  font-size: 12px;
}

.onb-mini[data-theme='dark'] {
  color-scheme: dark;
}

.onb-mini[data-theme='light'] {
  color-scheme: light;
}

:is(.dark, [data-theme='dark']) .onb-mini[data-theme='light'] {
  --mini-surface: var(--tx-text-color-primary, #e5eaf3);
  --mini-ink: var(--tx-bg-color, #141414);
  --mini-muted: color-mix(in srgb, var(--tx-bg-color, #141414) 55%, var(--tx-text-color-primary, #e5eaf3));
  --mini-line: color-mix(in srgb, var(--tx-bg-color, #141414) 12%, transparent);
}

/* The glass refracts; this tint keeps the rows readable over a busy
   wallpaper on every engine, the blur-only fallback included. */
.onb-mini__panel {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  border-radius: inherit;
  background: color-mix(in srgb, var(--mini-surface) 80%, transparent);
}

.onb-mini__input {
  display: flex;
  height: 40px;
  flex: none;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  box-shadow: inset 0 -1px 0 var(--mini-line);
}

.onb-mini__placeholder {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--mini-muted);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.onb-mini__keys {
  flex: none;
  color: var(--mini-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
}

.onb-mini__list {
  margin: 0;
  padding: 6px;
  list-style: none;
}

.onb-mini__list li {
  display: flex;
  height: 34px;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border-radius: 8px;
}

.onb-mini__list li.is-active {
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 16%, transparent);
}

.onb-mini__list i {
  flex: none;
  color: var(--mini-muted);
  font-size: 14px;
}

.onb-mini__title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.onb-mini__kind {
  color: var(--mini-muted);
  font-size: 11px;
}
</style>

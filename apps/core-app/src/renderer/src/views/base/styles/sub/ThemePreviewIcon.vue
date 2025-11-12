<template>
  <div class="ThemePreviewIcon" :class="[`variant-${variant}`, { active }]">
    <svg v-if="variant === 'personalized'" viewBox="0 0 64 48" role="presentation" aria-hidden="true">
      <rect x="2" y="4" width="60" height="40" rx="10" class="panel" />
      <rect x="10" y="12" width="44" height="6" rx="3" class="bar bar-1" />
      <rect x="10" y="22" width="34" height="6" rx="3" class="bar bar-2" />
      <rect x="10" y="32" width="40" height="6" rx="3" class="bar bar-3" />
      <circle cx="42" cy="15" r="4" class="knob" />
      <circle cx="26" cy="25" r="4" class="knob" />
      <circle cx="48" cy="35" r="4" class="knob" />
    </svg>

    <svg v-else-if="variant === 'emphasis'" viewBox="0 0 64 48" role="presentation" aria-hidden="true">
      <rect x="2" y="4" width="60" height="40" rx="10" class="panel" />
      <rect x="10" y="12" width="44" height="6" rx="3" class="bar bar-1" />
      <rect x="10" y="21" width="44" height="6" rx="3" class="bar bar-2" />
      <rect x="10" y="30" width="44" height="6" rx="3" class="bar bar-3" />
      <circle cx="20" cy="15" r="4" class="pulse pulse-1" />
      <circle cx="36" cy="24" r="6" class="pulse pulse-2" />
      <circle cx="44" cy="34" r="3" class="pulse pulse-3" />
    </svg>

    <svg v-else-if="variant === 'palette'" viewBox="0 0 64 48" role="presentation" aria-hidden="true">
      <rect x="2" y="4" width="60" height="40" rx="10" class="panel" />
      <rect x="9" y="12" width="14" height="24" rx="5" class="swatch swatch-1" />
      <rect x="25" y="12" width="14" height="24" rx="5" class="swatch swatch-2" />
      <rect x="41" y="12" width="14" height="24" rx="5" class="swatch swatch-3" />
    </svg>

    <svg v-else-if="variant === 'wallpaper'" viewBox="0 0 64 48" role="presentation" aria-hidden="true">
      <rect x="2" y="4" width="60" height="40" rx="10" class="panel" />
      <rect x="7" y="12" width="50" height="23" rx="6" class="sky" />
      <circle cx="18" cy="20" r="5" class="sun" />
      <path d="M8 34 L22 20 L32 30 L38 25 L53 35 Z" class="mount" />
      <rect x="7" y="32" width="50" height="8" rx="3" class="ground" />
    </svg>

    <svg v-else-if="variant === 'coloring'" viewBox="0 0 64 48" role="presentation" aria-hidden="true">
      <rect x="2" y="4" width="60" height="40" rx="10" class="panel" />
      <path
        class="drop"
        d="M32 10 C27 18 22 23 22 29 C22 35 26.5 38.5 32 38.5 C37.5 38.5 42 35 42 29 C42 23 37 18 32 10 Z"
      />
      <circle cx="32" cy="30" r="6" class="highlight" />
    </svg>

    <svg v-else-if="variant === 'contrast'" viewBox="0 0 64 48" role="presentation" aria-hidden="true">
      <rect x="2" y="4" width="60" height="40" rx="10" class="panel" />
      <rect x="10" y="12" width="44" height="24" rx="6" class="split" />
      <rect x="10" y="12" width="22" height="24" rx="6" class="split-left" />
      <rect x="32" y="12" width="22" height="24" rx="6" class="split-right" />
      <line x1="32" y1="12" x2="32" y2="36" class="divider" />
    </svg>

    <svg v-else-if="variant === 'guide'" viewBox="0 0 64 48" role="presentation" aria-hidden="true">
      <rect x="2" y="4" width="60" height="40" rx="10" class="panel" />
      <path
        class="question"
        d="M32 14 C27 14 23.5 17.5 23.5 21.5 C23.5 22.5 24.3 24 25.8 24 C27.1 24 27.8 23.3 28.2 22.4 C28.9 20.9 30.3 19.9 32 19.9 C34.1 19.9 35.7 21.2 35.7 23.2 C35.7 25 34.6 26.2 32.5 27.3 C30.2 28.6 29.1 30.2 29.1 33.2 V34 H34.9 V33.1 C34.9 31.5 35.7 30.7 37.6 29.6 C40.2 28.1 41.8 25.7 41.8 22.8 C41.8 17.9 37.8 14 32 14 Z"
      />
      <circle cx="32" cy="38" r="2.4" class="question-dot" />
    </svg>
  </div>
</template>

<script lang="ts" setup>
withDefaults(
  defineProps<{
    variant:
      | 'personalized'
      | 'emphasis'
      | 'palette'
      | 'wallpaper'
      | 'coloring'
      | 'contrast'
      | 'guide'
    active?: boolean
  }>(),
  {
    active: false
  }
)
</script>

<style scoped>
.ThemePreviewIcon {
  width: 52px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
}

.ThemePreviewIcon svg {
  width: 80%;
  height: 80%;
}

.ThemePreviewIcon.active {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  box-shadow: 0 0 0 2px rgba(var(--el-color-primary-rgb, 64, 158, 255), 0.15);
  transform: translateY(-1px);
}

.ThemePreviewIcon .panel {
  fill: var(--el-fill-color);
}

.ThemePreviewIcon .bar {
  fill: var(--el-fill-color-darker);
}

.ThemePreviewIcon .knob {
  fill: currentColor;
}

.variant-emphasis .bar {
  fill: var(--el-fill-color-dark);
}
.variant-emphasis .pulse {
  fill: currentColor;
  opacity: 0.35;
}
.variant-emphasis .pulse-2 {
  opacity: 0.5;
}

.variant-palette .swatch {
  fill: currentColor;
  opacity: 0.35;
}
.variant-palette .swatch-1 {
  opacity: 0.6;
}
.variant-palette .swatch-2 {
  opacity: 0.8;
}
.variant-palette .swatch-3 {
  opacity: 1;
}

.variant-wallpaper .sky {
  fill: var(--el-fill-color);
}
.variant-wallpaper .sun {
  fill: currentColor;
  opacity: 0.8;
}
.variant-wallpaper .mount {
  fill: var(--el-text-color-placeholder);
  opacity: 0.4;
}
.variant-wallpaper .ground {
  fill: var(--el-fill-color-dark);
  opacity: 0.6;
}

.variant-coloring .drop {
  fill: currentColor;
  opacity: 0.35;
}
.variant-coloring .highlight {
  fill: currentColor;
  opacity: 0.15;
}

.variant-contrast .split {
  fill: var(--el-fill-color-dark);
  opacity: 0.35;
}
.variant-contrast .split-left {
  fill: var(--el-fill-color);
}
.variant-contrast .split-right {
  fill: currentColor;
  opacity: 0.25;
}
.variant-contrast .divider {
  stroke: currentColor;
  stroke-width: 1.5;
  opacity: 0.5;
}

.variant-guide .question,
.variant-guide .question-dot {
  fill: currentColor;
  opacity: 0.75;
}
</style>

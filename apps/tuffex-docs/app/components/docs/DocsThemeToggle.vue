<script setup lang="ts">
import { computed } from 'vue'

const colorMode = useColorMode()
const { locale } = useI18n()

const isDark = computed(() => colorMode.value === 'dark')
const ariaLabel = computed(() => {
  if (locale.value === 'zh')
    return isDark.value ? '切换到浅色模式' : '切换到深色模式'
  return isDark.value ? 'Switch to light mode' : 'Switch to dark mode'
})

function toggleTheme(event: MouseEvent) {
  const nextMode = isDark.value ? 'light' : 'dark'
  const apply = () => {
    colorMode.preference = nextMode
  }

  if (
    !import.meta.client
    || typeof document.startViewTransition !== 'function'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    apply()
    return
  }

  const x = event.clientX
  const y = event.clientY
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  )

  const transition = document.startViewTransition(() => {
    apply()
  })

  void transition.ready.then(() => {
    const clipPath = [
      `circle(0px at ${x}px ${y}px)`,
      `circle(${endRadius}px at ${x}px ${y}px)`,
    ]
    document.documentElement.animate(
      { clipPath: isDark.value ? [...clipPath].reverse() : clipPath },
      {
        duration: 360,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        pseudoElement: isDark.value ? '::view-transition-old(root)' : '::view-transition-new(root)',
      },
    )
  }).catch(() => {})
}
</script>

<template>
  <button
    type="button"
    class="docs-theme-toggle"
    :aria-label="ariaLabel"
    :title="ariaLabel"
    @click="toggleTheme"
  >
    <span class="docs-theme-toggle__icon i-carbon-sun dark:hidden" aria-hidden="true" />
    <span class="docs-theme-toggle__icon i-carbon-moon hidden dark:inline-block" aria-hidden="true" />
  </button>
</template>

<style scoped>
.docs-theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--docs-ink-regular);
  font-size: 16px;
  cursor: pointer;
}

.docs-theme-toggle:hover {
  background: color-mix(in srgb, var(--docs-ink) 7%, transparent);
  color: var(--docs-ink);
}
</style>

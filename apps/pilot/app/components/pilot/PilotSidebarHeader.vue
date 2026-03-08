<script setup lang="ts">
import coreAppLogoUrl from '../../../../core-app/public/logo.svg?url'

interface PilotSidebarHeaderProps {
  pilotTitle: string
  running: boolean
  collapsed: boolean
}

const props = defineProps<PilotSidebarHeaderProps>()

const emit = defineEmits<{
  (e: 'createSession'): void
  (e: 'toggleCollapse'): void
}>()

function onCreateSession() {
  emit('createSession')
}

function onToggleCollapse() {
  emit('toggleCollapse')
}
</script>

<template>
  <header class="pilot-sidebar-header" :class="{ 'is-collapsed': props.collapsed }">
    <button
      class="pilot-sidebar-header__logo"
      type="button"
      :disabled="props.running"
      aria-label="新建会话"
      @click="onCreateSession"
    >
      <img :src="coreAppLogoUrl" alt="">
    </button>

    <p class="pilot-sidebar-header__title">
      {{ props.pilotTitle }}
    </p>

    <button
      class="pilot-sidebar-header__toggle"
      type="button"
      :aria-label="props.collapsed ? '展开侧边栏' : '收起侧边栏'"
      @click="onToggleCollapse"
    >
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="2.5" y="3.5" width="15" height="13" rx="3" />
        <path d="M10 3.5V16.5" />
      </svg>
    </button>
  </header>
</template>

<style scoped>
.pilot-sidebar-header {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 34px;
  align-items: center;
  gap: 8px;
}

.pilot-sidebar-header__logo,
.pilot-sidebar-header__toggle {
  appearance: none;
  border: 0;
  outline: 0;
  cursor: pointer;
  color: var(--tx-text-color-primary);
  background: color-mix(in srgb, var(--tx-fill-color-light) 66%, transparent);
  transition: background-color 140ms ease, opacity 140ms ease;
}

.pilot-sidebar-header__logo {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.pilot-sidebar-header__logo img {
  width: 26px;
  height: 26px;
  object-fit: contain;
}

.pilot-sidebar-header__title {
  margin: 0;
  min-width: 0;
  font-size: 12px;
  line-height: 1;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: color-mix(in srgb, var(--tx-text-color-primary) 82%, var(--tx-text-color-secondary));
  transition: opacity 140ms ease, transform 140ms ease;
}

.pilot-sidebar-header__toggle {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.pilot-sidebar-header__toggle svg {
  width: 18px;
  height: 18px;
}

.pilot-sidebar-header__toggle rect,
.pilot-sidebar-header__toggle path {
  stroke: currentColor;
  stroke-width: 1.5;
}

.pilot-sidebar-header__logo:hover,
.pilot-sidebar-header__toggle:hover {
  background: color-mix(in srgb, var(--tx-fill-color-lighter) 72%, transparent);
}

.pilot-sidebar-header__logo:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.pilot-sidebar-header.is-collapsed {
  grid-template-columns: 40px 0 34px;
  gap: 4px;
}

.pilot-sidebar-header.is-collapsed .pilot-sidebar-header__title {
  opacity: 0;
  transform: translateX(-6px);
}
</style>

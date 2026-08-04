<script lang="ts" name="ShellSidebar" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { useRendererPlatform } from '~/modules/platform/renderer-platform'
import ShellBrand from './ShellBrand.vue'
import ShellNavItem from './ShellNavItem.vue'
import ShellSearchEntry from './ShellSearchEntry.vue'
import ShellTrafficLights from './ShellTrafficLights.vue'

const { t } = useI18n()
const transport = useTuffTransport()
const { isMac } = useRendererPlatform()

const searchKbd = computed(() => (isMac.value ? '⌘E' : 'Ctrl+E'))

function openCoreBox(): void {
  transport.send(CoreBoxEvents.ui.show).catch(() => {})
}
</script>

<template>
  <aside class="ShellSidebar">
    <ShellTrafficLights />

    <ShellBrand />

    <ShellSearchEntry :placeholder="t('shell.search')" :kbd="searchKbd" @activate="openCoreBox" />

    <nav class="ShellSidebar-Nav">
      <!-- TODO(08-04-home-conversation): point at `/home` once the conversation route lands. -->
      <ShellNavItem icon="i-ri-edit-box-line" :label="t('shell.newChat')" to="/setting" />
      <div class="ShellSidebar-NavGap" />
      <ShellNavItem
        icon="i-ri-sparkling-2-line"
        :label="t('shell.intelligence')"
        to="/intelligence"
      />
      <ShellNavItem icon="i-ri-store-2-line" :label="t('shell.store')" to="/store" />
    </nav>

    <!-- Conversation history buckets are filled by 08-04-home-conversation. -->
    <slot name="conversations" />

    <div class="ShellSidebar-Spacer" />

    <ShellNavItem icon="i-ri-settings-3-line" :label="t('shell.setting')" to="/setting" />
  </aside>
</template>

<style lang="scss" scoped>
.ShellSidebar {
  z-index: 10;
  position: relative;
  display: flex;
  flex: 0 0 var(--shell-sidebar-width);
  flex-direction: column;
  gap: 10px;
  width: var(--shell-sidebar-width);
  padding: 14px;
  box-sizing: border-box;
  border-right: 1px solid var(--shell-border);
  background: var(--shell-surface);
  -webkit-app-region: drag;
}

.ShellSidebar-Nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
}

.ShellSidebar-NavGap {
  height: 4px;
}

.ShellSidebar-Spacer {
  flex: 1 1 auto;
  min-height: 0;
}
</style>

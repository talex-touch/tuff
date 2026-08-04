<script lang="ts" name="ShellTopBar" setup>
import LayoutBackButton from '~/components/layout/LayoutBackButton.vue'
import { useSecondaryNavigation } from '~/modules/layout/useSecondaryNavigation'

const { canNavigateBack, navigateBack } = useSecondaryNavigation({ debugLabel: 'ShellTopBar' })
</script>

<template>
  <header class="ShellTopBar">
    <div class="ShellTopBar-Leading">
      <LayoutBackButton :visible="canNavigateBack" @click="navigateBack" />
      <slot name="leading" />
    </div>

    <div class="ShellTopBar-Actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style lang="scss" scoped>
.ShellTopBar {
  z-index: 5;
  position: relative;
  display: flex;
  flex: 0 0 var(--shell-topbar-height);
  align-items: center;
  justify-content: space-between;
  height: var(--shell-topbar-height);
  padding: 0 32px;
  box-sizing: border-box;
  -webkit-app-region: drag;
}

.ShellTopBar-Leading,
.ShellTopBar-Actions {
  display: flex;
  gap: 2px;
  align-items: center;
  -webkit-app-region: no-drag;
}
</style>

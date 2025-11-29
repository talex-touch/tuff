<script lang="ts" name="FlatController" setup>
import { useLayoutController } from '~/composables/layout/useLayoutController'

const { route, t, handleUpgradeClick } = useLayoutController()
</script>

<template>
  <div class="FlatLayout-Icon">
    <img src="../../../assets/logo.svg" alt="logo">
    <div class="FlatLayout-Nav">
      <slot name="nav" />
    </div>
    <span @click="handleUpgradeClick">
      <slot name="title" />
    </span>
  </div>

  <span class="mx-auto">
    {{ route.name ?? route.path }}
  </span>

  <ul class="FlatLayout-Controller">
    {{
      t('flatController.useNative')
    }}
  </ul>
</template>

<style lang="scss">
@use '~/styles/layout/controller-mixins' as *;

.FlatLayout-Controller {
  @include controller-buttons;
  opacity: 0;
}

.FlatLayout-Nav {
  @include controller-nav;
  margin-right: 4px;
}

.FlatLayout-Icon {
  & span {
    @include update-indicator;

    padding: 4px 2px;
    font-size: 12px;
    pointer-events: none;
    -webkit-app-region: no-drag;
  }

  body.darwin & {
    padding-right: 4px;
    flex-direction: row-reverse;
  }

  display: flex;
  padding: 0 0 0 0.5%;

  height: var(--ctr-height);
  width: var(--nav-width);

  align-items: center;
  text-indent: 5px;
  box-sizing: border-box;

  img {
    width: 24px;
  }
}
</style>

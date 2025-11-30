<script lang="ts" name="SimpleController" setup>
import { computed } from 'vue'
import { useLayoutController } from '~/composables/layout/useLayoutController'

const { route, t, handleUpgradeClick } = useLayoutController()
const routeLabel = computed(() => route?.name ?? route?.path ?? '')
</script>

<template>
  <div class="SimpleController fake-background">
    <div class="SimpleController-Head flex-shrink-0">
      <AppLogo />
      <span flex items-center gap-2 class="max-w-[80px]" truncate @click="handleUpgradeClick">
        <slot name="title" />
      </span>
    </div>

    <div class="mx-auto relative w-full flex items-center justify-center">
      <div class="SimpleController-Nav absolute left-2">
        <slot name="nav" />
      </div>
      <span> {{ routeLabel }}</span>
    </div>

    <ul class="SimpleController-Controller">
      {{
        t('flatController.useNative')
      }}
    </ul>
  </div>
</template>

<style lang="scss">
@use '~/styles/layout/controller-mixins' as *;

.SimpleController {
  position: relative;
  // padding: 0.1rem 0.5rem;
  display: flex;

  width: 100%;
  height: var(--ctr-height);

  align-items: center;
  // justify-content: space-around;

  --fake-inner-opacity: 0.5;

  img {
    width: 24px;
  }
}

.SimpleController-Controller {
  @include controller-buttons;
}

.SimpleController-Nav {
  @include controller-nav;
}

.SimpleController-Head {
  .darwin & {
    padding-right: 0.5rem;
    justify-content: flex-end;
  }
  position: relative;
  display: flex;

  height: var(--ctr-height);
  width: var(--nav-width);

  gap: 0.5rem;
  align-items: center;

  border-right: 1px solid var(--el-border-color);
}

</style>

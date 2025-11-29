<script lang="ts" name="AppLayoutFlat" setup>
import FlatController from './FlatController.vue'
import LayoutFooter from '../shared/LayoutFooter.vue'
import FlatNavBar from './FlatNavBar.vue'

const props = withDefaults(
  defineProps<{
    display?: boolean
  }>(),
  {
    display: false,
  },
)

const isDisplayMode = computed(() => props.display)
</script>

<template>
  <div class="AppLayout-Container Flat" :class="{ 'is-display': isDisplayMode }">
    <div class="AppLayout-Header fake-background">
      <FlatController>
        <template #nav>
          <slot name="nav" />
        </template>
        <template v-if="!isDisplayMode" #title>
          <slot name="title" />
        </template>
      </FlatController>
    </div>
    <div class="AppLayout-Main">
      <div class="AppLayout-Aside fake-background">
        <FlatNavBar>
          <slot name="navbar" />
        </FlatNavBar>

        <div class="AppLayout-IconFooter">
          <slot v-if="!isDisplayMode" name="icon" />
          <LayoutFooter v-if="!isDisplayMode" />
          <div v-else class="LayoutDisplay-Footer" />
        </div>
      </div>

      <div class="AppLayout-View fake-background">
        <slot v-if="!isDisplayMode" name="view" />
        <div v-else class="LayoutDisplay-View" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '~/styles/layout/container-base' as *;

.AppLayout-Container.Flat {
  @include layout-variables;

  .AppLayout-View {
    @include layout-view-base;
    --fake-radius: 8px 0 0 0;
    border-radius: 8px 0 0 0;
  }

  .AppLayout-IconFooter {
    @include layout-icon-footer;
  }

  .AppLayout-Header {
    padding: 0;
    justify-content: space-between;

    body.darwin & {
      flex-direction: row-reverse;
      justify-content: center;
    }
  }
}

.AppLayout-Container.Flat {
  @include layout-display-mode-base;

  &.is-display {
    --ctr-height: 28px;
    --nav-width: 64px;
    padding: 6px 8px;

    .AppLayout-Header {
      gap: 10px;
    }

    .AppLayout-Aside {
      padding: 4px;
      border-right: none;
    }

    .AppLayout-IconFooter {
      min-height: 36px;
    }

    :deep(.TouchMenuItem-Container) {
      padding: 0.3rem;
      margin: 0.15rem 0;
      --fake-inner-opacity: 0.35;
    }

    .LayoutDisplay-View,
    .LayoutDisplay-Footer {
      opacity: 0.65;
    }

    .LayoutDisplay-Footer {
      height: 34px;
      margin-top: 8px;
    }
  }
}
</style>

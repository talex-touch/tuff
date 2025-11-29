<script lang="ts" name="AppLayoutSimple" setup>
import SimpleController from './SimpleController.vue'
import LayoutFooter from '../shared/LayoutFooter.vue'
import SimpleNavBar from './SimpleNavBar.vue'

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
  <div class="AppLayout-Container Simple" :class="{ 'is-display': isDisplayMode }">
    <div class="AppLayout-Header fake-background">
      <SimpleController>
        <template #nav>
          <slot name="nav" />
        </template>
        <template v-if="!isDisplayMode" #title>
          <slot name="title" />
        </template>
      </SimpleController>
    </div>
    <div class="AppLayout-Main">
      <div class="AppLayout-Aside fake-background">
        <SimpleNavBar>
          <slot name="navbar" />
        </SimpleNavBar>

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

.AppLayout-Container.Simple {
  @include layout-variables;

  .AppLayout-View {
    @include layout-view-base;
    --fake-radius: 0;
    border-radius: 0;
  }

  .AppLayout-IconFooter {
    @include layout-icon-footer;
  }

  .AppLayout-Aside {
    --fake-inner-opacity: 0.5;
    border-right: 1px solid var(--el-border-color);
  }

  .AppLayout-Header {
    padding: 0;
    justify-content: space-between;

    --fake-opacity: 1;
    border-bottom: 1px solid var(--el-border-color);

    body.darwin & {
      flex-direction: row-reverse;
      justify-content: center;
    }
  }
}

.AppLayout-Container.Simple {
  @include layout-display-mode-base;

  &.is-display {
    --ctr-height: 26px;
    --nav-width: 68px;
    padding: 6px;

    .AppLayout-Header {
      border-bottom: none;
      gap: 8px;
    }

    .AppLayout-Main {
      gap: 6px;
    }

    .AppLayout-Aside {
      padding: 2px 4px;
      border-right: none;
    }

    .AppLayout-IconFooter {
      min-height: 32px;
    }

    :deep(.TouchMenuItem-Container) {
      padding: 0.25rem;
      margin: 0.2rem 0;
      --fake-inner-opacity: 0.4;
    }

    .LayoutDisplay-View,
    .LayoutDisplay-Footer {
      opacity: 0.6;
    }

    .LayoutDisplay-Footer {
      height: 32px;
      margin-top: 6px;
    }
  }
}
</style>

<template>
  <div class="SimpleController fake-background">
    <div class="SimpleController-Head">
      <AppLogo />
      <span flex items-center gap-2 class="max-w-[80px]" truncate @click="handleUpgradeClick">
        <slot name="title" />
      </span>
    </div>

    <span class="mx-auto">
      {{ route.name ?? route.path }}
    </span>

    <ul class="SimpleController-Controller">
      {{
        t('flatController.useNative')
      }}
    </ul>
  </div>
</template>

<script lang="ts" name="FlatController" setup>
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useApplicationUpgrade } from '~/modules/hooks/useUpdate'

const route = useRoute()
const { t } = useI18n()
const { checkApplicationUpgrade } = useApplicationUpgrade()

const handleUpgradeClick = () => {
  void checkApplicationUpgrade()
}
</script>

<style lang="scss">
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
  .darwin & {
    display: none;
  }
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

.FlatLayout-Icon {
  & span {
    .has-update &:after {
      content: '';
      position: absolute;

      margin-left: 10px;
      margin-top: 4px;

      width: 8px;
      height: 8px;

      border-radius: 50%;
      background-color: var(--el-color-warning);

      animation: breathing 1.5s ease-in-out infinite;
    }

    .has-update & {
      pointer-events: all;
      cursor: pointer;

      span {
        background-color: var(--el-color-warning-light-7) !important;
      }

      // :deep(span) {
      //   background-color: var(--el-color-warning-light-7) !important;
      // }
    }

    .touch-blur & {
      opacity: 0.75;
    }

    padding: 4px 2px;
    font-size: 12px;

    pointer-events: none;
    -webkit-app-region: no-drag;
  }

}
</style>

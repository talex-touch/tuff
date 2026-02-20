<script lang="ts" name="View" setup>
import { TxGradualBlur } from '@talex-touch/tuffex'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import TouchScroll from '../TouchScroll.vue'
import { resolveI18nLabel } from '~/utils/i18n-helpers'

const props = withDefaults(
  defineProps<{
    title?: string
    len?: number
  }>(),
  {
    title: 'ViewTemplate',
    len: 1
  }
)

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const subRouterMode = computed(() => route.matched?.length > props.len)
const resolvedTitle = computed(() => resolveI18nLabel(props.title, t))
const routeTitleSource = computed(() => {
  if (typeof route?.name === 'string' && route.name) {
    return route.name
  }

  return props.title ?? ''
})
</script>

<template>
  <div :class="{ router: subRouterMode }" class="ViewTemplate">
    <div
      :class="{ blur: subRouterMode }"
      class="ViewTemplate-Wrapper transition-cubic absolute w-full h-full"
    >
      <TxGradualBlur
        exponential
        :div-count="10"
        position="top"
        height="24px"
        :strength="1.4"
        :opacity="0.9"
        :z-index="20"
      />
      <TxGradualBlur
        exponential
        :div-count="10"
        position="bottom"
        height="24px"
        :strength="1.4"
        :opacity="0.9"
        :z-index="20"
      />
      <TouchScroll no-padding class="ViewTemplate-Scroll">
        <div class="View-Container px-4 py-6">
          <slot />
        </div>
      </TouchScroll>
    </div>

    <div
      :class="{ visible: subRouterMode }"
      class="ViewTemplate-Router fake-background transition-cubic absolute w-full h-full"
    >
      <view-template v-if="subRouterMode" :len="len + 1" :title="routeTitleSource">
        <div
          class="ViewTemplate-RouterTitle cursor-pointer flex items-center text-xl"
          @click="router.back"
        >
          <div i-ri-arrow-left-s-line />
          {{ resolvedTitle }}
        </div>
        <router-view />
      </view-template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ViewTemplate-Router {
  &.visible {
    border-radius: 0;
    transform: translateX(0);
  }

  z-index: 10;

  border-radius: 18px;
  transform: translateX(120%);
}

.ViewTemplate {
  position: relative;

  height: 100%;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  min-height: 0;
}

.ViewTemplate-Wrapper,
.ViewTemplate-Router {
  inset: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ViewTemplate-Scroll {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.ViewTemplate-Wrapper.blur {
  filter: blur(18px) saturate(180%);
}

.View-Header {
  z-index: 100;
  position: sticky;
  display: flex;

  top: 0;

  justify-content: center;
  align-items: center;

  width: 100%;
  height: 4rem;
}

.View-Container {
  position: relative;

  min-height: 100%;
  width: 100%;

  box-sizing: border-box;
}
</style>

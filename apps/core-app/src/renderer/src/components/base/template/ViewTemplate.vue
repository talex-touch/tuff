<template>
  <div :class="{ router: subRouterMode }" class="ViewTemplate">
    <div
      :class="{ blur: subRouterMode }"
      class="ViewTemplate-Wrapper transition-cubic p-2 absolute w-full h-full"
    >
      <el-scrollbar>
        <div class="View-Container">
          <slot />
        </div>
      </el-scrollbar>
    </div>

    <div
      :class="{ visible: subRouterMode }"
      class="ViewTemplate-Router fake-background transition-cubic absolute w-full h-full"
    >
      <view-template :len="len + 1" :title="String(route.name) ?? title" v-if="subRouterMode">
        <div
          @click="router.back"
          class="ViewTemplate-RouterTitle cursor-pointer flex items-center text-xl"
        >
          <div i-ri-arrow-left-s-line />
          {{ title }}
        </div>
        <router-view></router-view>
      </view-template>
    </div>
  </div>
</template>

<script lang="ts" name="View" setup>
import { useRoute, useRouter } from 'vue-router'

const props = withDefaults(
  defineProps<{
    title: string
    len?: number
  }>(),
  {
    title: 'ViewTemplate',
    len: 1
  }
)

const route = useRoute()
const router = useRouter()
const subRouterMode = computed(() => route.matched?.length > props.len)

watchEffect(() => {
  console.log(route, route.matched)
})
</script>

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
  padding: 0.5rem;

  height: 100%;
  width: 100%;

  box-sizing: border-box;
}
</style>

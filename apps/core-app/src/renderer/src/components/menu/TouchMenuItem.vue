<template>
  <div
    ref="dom"
    v-wave
    :data-route="props.route"
    class="TouchMenuItem-Container fake-background"
    flex
    items-center
    :class="{ active, disabled }"
    @click="handleClick"
  >
    <slot>
      <span :class="`${icon}`" class="TouchMenu-Tab-Icon"> </span>
      <span class="TouchMenu-Tab-Name">{{ name }}</span>
    </slot>
  </div>
</template>

<script lang="ts" name="TouchMenuItem" setup>
import { useRouter, useRoute } from 'vue-router'
import { onMounted, onUnmounted } from 'vue'

const props = defineProps({
  icon: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  route: {
    type: String,
    required: true
  },
  disabled: {
    type: Boolean,
    default: false
  },
  doActive: {
    type: Function,
    default: (route, $route) => {
      if (!$route) return false
      // 精确匹配路由路径
      if ($route.path === route) return true
      // 检查是否匹配路由记录
      return $route.matched.some((record) => record.path === route)
    }
  }
})
const emit = defineEmits(['active'])

const dom = ref()
const route = useRoute()
const router = useRouter()
const active = computed(() => props.doActive(props.route, route))

const changePointer = inject('changePointer')

let removeGuard

onMounted(() => {
  removeGuard = router.afterEach((to, from) => {
    if (!to.path.startsWith(props.route)) return

    if (changePointer && dom.value) {
      changePointer(dom.value)
    }
  })

  if (dom.value) {
    dom.value['$fixPointer'] = () => {
      if (changePointer && dom.value) {
        changePointer(dom.value)
      }
    }
  }
})

onUnmounted(() => {
  if (removeGuard) {
    removeGuard()
  }
})

function handleClick($event) {
  if (props.disabled) return

  if (props.route) router.push(props.route)

  if (changePointer && dom.value) {
    changePointer(dom.value)
  }
  emit('active', $event)
}
</script>

<style lang="scss" scoped>
.TouchMenuItem-Container {
  &:hover {
    --fake-inner-opacity: 0.5;
    --fake-color: var(--el-fill-color-dark);
  }

  &.active {
    --fake-inner-opacity: 0.75 !important;
    --fake-color: var(--el-fill-color-darker);
  }

  &.disabled {
    cursor: not-allowed;
    opacity: 0.5;
    --fake-color: transparent;
  }

  position: relative;
  display: flex;
  margin: 5px;
  padding: 0.5rem;

  cursor: pointer;
  user-select: none;
  border-radius: 8px;
  text-indent: 0.5em;
  box-sizing: border-box;

  --fake-color: transparent;
  --fake-radius: 8px;
}
</style>

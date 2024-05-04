<template>
  <div ref="dom" v-wave :data-route="props.route" @click="handleClick" class="TouchMenuItem-Container fake-background"
    flex items-center :class="{ active, disabled }">
    <slot>
      <span :class="`${icon}`" class="TouchMenu-Tab-Icon">
      </span>
      <span class="TouchMenu-Tab-Name">{{ name }}</span>
    </slot>
  </div>
</template>

<script name="TouchMenuItem" setup>
import { useRouter, useRoute } from "vue-router";

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
    default: (route, $route) => $route && $route.matched.some(record => record.path.startsWith(route))
  }
})
const emit = defineEmits(['active'])

const dom = ref()
const route = useRoute()
const router = useRouter()
const active = computed(() => props.doActive(props.route, route))

const changePointer = inject('changePointer')

router.afterEach((to, from) => {
  if (!to.path.startsWith(props.route))
    return

  changePointer(dom.value)
})

onMounted(() => {
  dom.value['$fixPointer'] = () => changePointer(dom.value)
})

function handleClick($event) {
  if (props.disabled) return

  if (props.route)
    router.push(props.route)

  changePointer(dom.value)
  emit('active', $event)
}
</script>

<style lang="scss" scoped>
.TouchMenuItem-Container {

  &:hover {
    --fake-inner-opacity: .5;
    --fake-color: var(--el-fill-color-dark);
  }

  &.active {
    --fake-inner-opacity: .75 !important;
    --fake-color: var(--el-fill-color-darker);
  }

  &.disabled {
    cursor: not-allowed;
    opacity: .5;
    --fake-color: transparent;
  }

  position: relative;
  display: flex;
  margin: 5px;
  padding: 8px 8px;

  cursor: pointer;
  user-select: none;
  border-radius: 4px;
  text-indent: .5em;
  box-sizing: border-box;

  --fake-color: transparent;
  --fake-radius: 4px;
}
</style>
<script setup lang="ts">
import { autoUpdate, flip, offset, useFloating } from '@floating-ui/vue'
import UserAvatar from '~/components/personal/UserAvatar.vue'
import { $endApi } from '~/composables/api/base'
import { models } from '~/components/model/model'

const props = defineProps<{
  input: string
  show: boolean
  target: any
}>()

const emits = defineEmits<{
  (event: 'select', data: any): void
}>()

const index = ref(0)
const list = ref(models)

function handleSelect(ind: number) {
  index.value = ind

  if (!list.value[index.value])
    return

  emits('select', list.value[index.value].key)
}

watch(() => index.value, (ind) => {
  const id = `slash-model-${ind}`
  const el = document.getElementById(id)

  if (props.show && el)
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
})

function handleKeyDown(e: KeyboardEvent) {
  if (!props.show)
    return

  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault()
      index.value = index.value > 0 ? index.value - 1 : list.value.length - 1
      break
    case 'ArrowDown':
      e.preventDefault()
      index.value = index.value < list.value.length - 1 ? index.value + 1 : 0
      break
    case 'Enter': {
      e.preventDefault()
      e.stopImmediatePropagation()
      handleSelect(index.value)
      break
    }
    default:
      break
  }

  // 判断小键盘上下键选择
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
})
onUnmounted(() => document.removeEventListener('keydown', handleKeyDown))

const inputRef = computed(() => props.target)
const floatingRef = ref()

const { floatingStyles } = useFloating(inputRef, floatingRef, {
  placement: 'left-start',
  middleware: [offset(({ rects }) => ({
    alignmentAxis: -rects.floating.height,
  })), flip()],
  whileElementsMounted: autoUpdate,
})

watch(() => globalConfigModel.value, () => {
  index.value = models.findIndex(item => item.key === globalConfigModel.value) || 0
})
</script>

<template>
  <teleport to="#teleports">
    <div ref="floatingRef" :class="{ show }" class="ThInputModel-Wrapper" :style="floatingStyles">
      <div class="ThInputModel fake-background">
        <p class="mention">
          <span>模型列表</span>
        </p>
        <div class="ThInputModel-Main">
          <el-scrollbar>
            <div
              v-for="(item, ind) in list" :id="`slash-model-${ind}`" :key="ind" v-wave
              :class="{ active: index === ind }" class="ThInputModel-Item" @click="handleSelect(ind)"
            >
              <img :src="item.img">
              <div class="ThInputModel-Item-Info fake-background">
                <p>{{ item.name }}</p>
              </div>
              <!-- <span class="usage">{{ item.usages?.length || 0 }}人正在使用</span> -->
            </div>
          </el-scrollbar>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss">
.ThInputModel-Main {
  position: relative;
  padding: 0.25rem;

  width: 100%;
  height: 300px;
}

.ThInputModel-Item {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0.5rem 0.5rem;
  // padding-bottom: 1.5rem;
  margin: 0.5rem;
  border-radius: 8px;
  transition: 0.3s;
  cursor: pointer;

  overflow-x: hidden;
  width: calc(100% - 1rem);

  --fake-opacity: 0;
  border: 2px solid transparent;

  &:hover {
    --fake-opacity: 0.25; // var(--el-fill-color);
    border: 2px solid var(--theme-color);
  }

  &.active {
    border: 2px solid var(--theme-color);
    --fake-color: var(--theme-color);
    --fake-opacity: 0.5;
  }

  img {
    flex-shrink: 0;

    width: 32px;
    height: 32px;
  }

  &-Info {
    flex: 1;
    width: 80%;
    margin-left: 1rem;

    p {
      font-size: 0.9em;
      font-weight: bold;
    }
  }
}

.ThInputModel {
  .mention {
    margin: 1rem 1rem 0;
    position: sticky;

    top: 0;

    font-weight: 600;
    font-size: 0.85em;
    color: var(--el-text-color-regular);
  }

  .el-scrollbar__bar.is-vertical {
    width: 3px;
  }

  .show & {
    opacity: 1;
    transform: translateX(100%) scale(1) translateY(-1rem);
  }

  &-Wrapper {
    z-index: 2;
    pointer-events: none;

    width: 300px;
    height: 350px;
    max-width: 85vw;

    &.show {
      pointer-events: all;
    }
  }

  position: absolute;

  width: 100%;
  height: 100%;

  border-radius: 16px;
  box-shadow: var(--el-box-shadow);

  opacity: 0;
  transform: translateX(100%) scale(0.9) translateY(10%);
  transition: cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.35s;
  transform-origin: center 10%;

  backdrop-filter: blur(18px) saturate(180%);
}
</style>

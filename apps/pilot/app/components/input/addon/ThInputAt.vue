<script setup lang="ts">
import { autoUpdate, flip, offset, useFloating } from '@floating-ui/vue'
import UserAvatar from '~/components/personal/UserAvatar.vue'
import { $endApi } from '~/composables/api/base'

const props = defineProps<{
  input: string
  show: boolean
  target: any
}>()

const emits = defineEmits<{
  (event: 'select', data: any): void
}>()

const index = ref(-1)
// const query = ref('')
const roles = ref<any>([])
const hotList = ref<any>([])
const loading = ref(false)
const list = computed(() => roles.value.length ? roles.value : hotList.value)

async function hotData() {
  const res: any = await $endApi.v1.aigc.getHostList()

  if (res.code === 200) {
    hotList.value = res.data

    if (hotList.value.length)
      index.value = 0
    else index.value = -1
  }
  else {
    ElMessage({
      message: res.message || '无法搜索模板！',
      grouping: true,
      type: 'error',
      plain: true,
    })
  }
}

async function fetchData() {
  roles.value.length = 0

  // 去除第一个字符
  const query = props.input.slice(1)
  if (!query)
    return

  loading.value = true

  const res: any = await $endApi.v1.aigc.searchPromptTemplate(query)

  if (res.code === 200) {
    roles.value = res.data

    if (roles.value.length)
      index.value = 0
    else index.value = -1
  }
  else {
    ElMessage({
      message: res.message || '无法搜索模板！',
      grouping: true,
      type: 'error',
      plain: true,
    })
  }

  loading.value = false
}

function handleSelect(ind: number) {
  if (index.value === -1)
    return

  index.value = ind

  if (!list.value[index.value])
    return

  emits('select', list.value[index.value])
}

let timer: any
watch(() => props.input, () => {
  clearTimeout(timer)
  if (!props.show)
    return

  setTimeout(fetchData, 200)
})
watch(() => index.value, (ind) => {
  const id = `at-prompt-role-${ind}`
  const el = document.getElementById(id)

  if (el)
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
})

function handleKeyDown(e: KeyboardEvent) {
  if (!props.show)
    return

  if (!list.value.length)
    return

  if (index.value === -1)
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

  hotData()
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
</script>

<template>
  <teleport to="#teleports">
    <div ref="floatingRef" :class="{ show }" class="ThInputAt-Wrapper" :style="floatingStyles">
      <div class="ThInputAt fake-background">
        <p v-if="list.length" class="mention">
          <span v-if="roles.length"> 搜索到 {{ list.length }} 个结果</span>
          <span v-else>热门角色列表</span>
        </p>
        <el-scrollbar>
          <div v-loader="loading" class="ThInputAt-Main">
            <el-empty v-if="input.length > 1 && !roles.length" description="暂无角色" />
            <div v-else class="ThInputAt-Main">
              <div
                v-for="(item, ind) in list" :id="`at-prompt-role-${ind}`" :key="item.id" v-wave
                :class="{ active: index === ind }" class="ThInputAt-Item" @click="handleSelect(ind)"
              >
                <UserAvatar :avatar="item.avatar" />
                <div class="ThInputAt-Item-Info fake-background">
                  <p>{{ item.title }}</p>
                  <p class="description">
                    {{ item.description || '-' }}
                  </p>
                </div>
                <!-- <span class="usage">{{ item.usages?.length || 0 }}人正在使用</span> -->
              </div>
            </div>
          </div>
        </el-scrollbar>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss">
.ThInputAt-Main {
  position: relative;
  padding: 0.25rem;

  width: 100%;
  min-height: 100%;
}

.ThInputAt-Item {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0.5rem 0.5rem;
  // padding-bottom: 1.5rem;
  margin: 0.5rem 0;
  border-radius: 8px;
  transition: 0.3s;
  cursor: pointer;

  overflow-x: hidden;
  width: 100%;

  --fake-opacity: 0;
  border: 2px solid transparent;

  &:hover {
    --fake-opacity: 0.25; // var(--el-fill-color);
  }

  &.active {
    border: 2px solid var(--theme-color);
    --fake-opacity: 0.5;
  }

  .el-avatar {
    flex-shrink: 0;

    width: 48px;
    height: 48px;
  }

  .usage {
    position: absolute;

    right: 0;
    bottom: 0.25rem;

    opacity: 0.75;
    transform: scale(0.75);
  }

  &-Info {
    flex: 1;
    width: 80%;
    margin-left: 1rem;

    p {
      &.description {
        // 高度只有一行 溢出隐藏
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;

        width: 90%;
      }

      margin: 0;

      &:first-child {
        font-size: 0.9em;
        font-weight: bold;
      }

      &:last-child {
        font-size: 0.8rem;
        color: var(--el-text-color-secondary);
        line-height: 1.2rem;
      }
    }
  }
}

.ThInputAt {
  .mention {
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

    width: 380px;
    height: 300px;
    max-width: 85vw;

    &.show {
      pointer-events: all;
    }
  }

  position: absolute;
  padding: 1rem;

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

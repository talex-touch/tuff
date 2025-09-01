<script name="AppList" setup lang="ts">
import PluginIcon from '~/components/plugin/PluginIcon.vue'

const props = defineProps<{
  list: any[]
  index: number
}>()
const emits = defineEmits<{
  (e: 'search', val: string): void
  (e: 'select', val: any, ind: number): void
}>()

enum EOrderWay {
  SORT_DESC = 0, // default
  DIC = 1,
  D_DIC = 2,
  FREQ = 3
}

const _list = ref<any[]>([])
const search = ref('')
const orderWay = ref<EOrderWay>(0)

watch(
  () => props.list,
  () => {
    _list.value = [...props.list]

    handleOrderWay()

    emits('select', null, -1)
  },
  { immediate: true }
)

function handleOrderWay() {
  console.log('a', orderWay.value)

  if (orderWay.value === EOrderWay.SORT_DESC) {
    _list.value = [...props.list]
    return
  }

  if (orderWay.value === EOrderWay.DIC) {
    _list.value = _list.value!.sort((a, b) => a.name.localeCompare(b.name))
    return
  }

  if (orderWay.value === EOrderWay.D_DIC) {
    _list.value = _list.value!.sort((a, b) => b.name.localeCompare(a.name))
    return
  }

  // The sorting logic is now handled by the backend (main process).
  // The frequency-based sorting (appAmo) is deprecated.
  // _list.value = _list.value!.sort((a, b) => {
  //   const aI = 0 // appAmo[a.name]
  //   const bI = 0 // appAmo[b.name]
  //
  //   if (aI === undefined && bI === undefined) {
  //     return 0
  //   }
  //
  //   if (aI === undefined) {
  //     return 1
  //   }
  //
  //   if (bI === undefined) {
  //     return -1
  //   }
  //
  //   return bI - aI
  // })
}

function handleOrderChange() {
  orderWay.value = (orderWay.value + 1) % 4

  handleOrderWay()

  emits('select', null, -1)
}

watch(
  () => search.value,
  (val) => {
    emits('search', val)
    // _list.value = props.list.filter(item => item.name.includes(val))
  }
)

function highlightText(text: string, matched: Array<any>) {
  let result = ''

  const [startIndex, endIndex] = matched

  // replace text index 2 html
  for (let i = 0; i < text.length; i++) {
    if (i >= startIndex && i <= endIndex) {
      result += `<span class="matched">${text[i]}</span>`
    } else {
      result += text[i]
    }
  }

  return result
}

function handleClick(item: any, ind: number) {
  // Repeat click => cancel
  if (props.index === ind) {
    emits('select', null, -1)
    return
  }
  emits('select', item, ind)
}
</script>

<template>
  <el-scrollbar>
    <TransitionGroup name="list" tag="ul" class="AppList">
      <div class="AppList-Toolbox">
        <FlatInput v-model="search" placeholder="Type to search..." :fetch="search" />

        <span @click="handleOrderChange" class="order-way">
          <i v-if="orderWay === 0" class="i-ri-sort-desc" />
          <i v-if="orderWay === 1" class="i-ri-sort-alphabet-asc" />
          <i v-if="orderWay === 2" class="i-ri-sort-alphabet-desc" />
          <i v-if="orderWay === 3" class="i-ri-sort-number-asc" />
        </span>
      </div>
      <li
        :index="ind"
        class="fake-background"
        :class="{ active: index === ind }"
        @click="handleClick(item, ind)"
        v-for="(item, ind) in _list"
      >
        <div class="AppList-IconContainer">
          <PluginIcon v-if="item.icon" :icon="item.icon" :alt="item.name" />
          <div v-else class="AppList-IconPlaceholder">
            <i class="i-ri-apps-2-line" />
          </div>
        </div>

        <div class="Main">
          <p v-if="item.matched" v-html="highlightText(item.name, item.matched)" />
          <p v-else v-text="item.name" />
          <!-- <p class="desc">{{ item.desc }}</p> -->
        </div>
      </li>
    </TransitionGroup>
    <div class="AppList-Info fake-background">
      <span v-if="search">{{ _list!.length }} searched on this device.</span>
      <span v-else>{{ _list!.length }} applications on this device.</span>
      <span class="order">
        <span v-if="orderWay === 0">Default Order</span>
        <span v-if="orderWay === 1">Dictionary In</span>
        <span v-if="orderWay === 2">Dictionary De</span>
        <span v-if="orderWay === 3">Number Frequent</span>
      </span>
    </div>
  </el-scrollbar>
</template>

<style lang="scss">
.list-enter-active,
.list-leave-active {
  transition: all 0.5s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.AppList-Info {
  span {
    opacity: 0.75;
    font-size: 0.8rem;
  }

  .order span {
    font-size: 0.7rem;
  }

  position: sticky;
  display: flex;
  padding: 0.25rem 0.75rem;

  justify-content: space-between;

  bottom: 0;

  // background-color: var(--el-fill-color);
  backdrop-filter: blur(18px) saturate(180%);
}

.AppList-Toolbox {
  .order-way {
    display: flex;

    align-items: center;
    justify-content: center;

    width: 32px;
    height: 32px;

    font-size: 1.25rem;
    background-color: var(--el-fill-color-dark);
    border-radius: 8px;
    cursor: pointer;

    &:hover {
      background-color: var(--el-color-primary-light-5);
    }
  }

  z-index: 100;
  position: sticky;
  display: flex;
  padding: 0.25rem;

  justify-content: space-between;

  top: 0;

  gap: 0.5rem;
  border-radius: 8px;
  background-color: var(--el-fill-color);
}

.AppList li {
  &.active {
    --fake-color: var(--el-color-primary-light-5);
    border: 1px solid var(--el-color-primary);
  }

  padding: 0 0.5rem;

  top: 0.5rem;

  display: flex;
  align-items: center;
  gap: 0.5rem;

  cursor: pointer;
  transition: 0.25s;
  border: 1px solid transparent;

  .AppList-IconContainer {
    width: 2rem;
    height: 2rem;
    flex-shrink: 0;

    .AppList-IconPlaceholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--el-fill-color-lighter);
      border-radius: 4px;
      color: var(--el-text-color-placeholder);

      i {
        font-size: 1.2rem;
      }
    }
  }

  .Main {
    p {
      margin: 0;
      font-size: 0.8rem;
    }

    .desc {
      font-size: 0.8rem;
      color: var(--el-text-color-secondary);
    }
  }
}

.AppList {
  display: flex;
  margin: 0;
  padding: 1rem 0.5rem;

  gap: 0.5rem;
  flex-direction: column;

  list-style: none;

  li {
    height: 48px;
    overflow: hidden;

    border-radius: 8px;
    --fake-color: var(--el-fill-color);
  }
}
</style>

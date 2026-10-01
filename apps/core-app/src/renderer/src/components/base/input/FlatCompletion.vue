<script setup lang="ts" name="FlatCompletion">
import { computePosition } from '@floating-ui/vue'
import { sleep } from '@talex-touch/utils/common/utils'
import { TxInput } from '@talex-touch/tuffex/input'
import {
  createFlatCompletionUpdate,
  resolveFlatCompletionPlaceholder
} from './flat-completion-utils'

/**
 * The template has two roots (field + teleported panel), so Vue cannot inherit fallthrough
 * attributes onto one of them. Bind them to the field root by hand instead: without this a
 * caller's `class` never reached the DOM at all.
 */
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    /**
     * CSS class for the leading icon. Callers pass an iconify class (`i-ri-…`); the value is handed
     * to `TxInput`'s `prefixIcon` so it renders through the same prefix path as the rest of the app.
     */
    icon?: string
    placeholder?: string
    fetch: (query: string) => unknown[]
  }>(),
  {
    icon: 'i-ri-search-line',
    placeholder: ''
  }
)
const emit = defineEmits<{
  search: [query: string]
}>()

const _res = ref<unknown[]>([])
const res = ref<unknown[]>([])
const completionInput = ref<HTMLElement | null>(null)
const completionWrapper = ref<HTMLElement | null>(null)
const value = ref('')
const inputPlaceholder = computed(() => resolveFlatCompletionPlaceholder(props.placeholder))

watch(
  value,
  () => {
    nextTick(refreshCompletion)
  },
  { immediate: true }
)

async function refreshCompletionItems() {
  const el = completionWrapper.value
  if (!el) return

  for (const item of [...el.children].reverse()) {
    setTimeout(async () => {
      item.classList.add('remove')
      await sleep(500)
      item.remove()
    })
    await sleep(125)
  }

  await sleep(600)
  _res.value = res.value
}

function refreshCompletion() {
  const nextState = createFlatCompletionUpdate(value.value, props.fetch)
  value.value = nextState.query
  emit('search', nextState.query)
  if (res.value !== nextState.results) {
    res.value = nextState.results
    void refreshCompletionItems()
  }
  nextTick(async () => {
    if (!completionInput.value || !completionWrapper.value) return

    const floating = await computePosition(completionInput.value, completionWrapper.value)

    Object.assign(completionWrapper.value.style, {
      top: `${floating.y}px`,
      left: `${floating.x}px`
    })
  })
}
</script>

<template>
  <div ref="completionInput" class="FlatCompletion-Field" v-bind="$attrs">
    <TxInput v-model="value" :placeholder="inputPlaceholder" :prefix-icon="props.icon" />
  </div>
  <teleport to="body">
    <div ref="completionWrapper" class="FlatCompletion-Panel" @click="value = ''">
      <!--      <TxScroll> -->
      <div
        v-for="(item, index) in _res"
        :key="index"
        v-wave
        class="FlatCompletion-Item fake-background"
        :style="`--d: ${index * 0.125}s`"
      >
        <slot :item="item">
          {{ item }}
        </slot>
      </div>
      <!--      </TxScroll> -->
    </div>
  </teleport>
</template>

<style lang="scss" scoped>
.FlatCompletion-Panel {
  z-index: 100;
  position: absolute;
  display: flex;
  padding: 10px;

  flex-direction: column;
  justify-content: center;
  align-items: center;

  max-height: 380px;
  //background-color: var(--tx-fill-color-extra-light);
  border-radius: 50px;
  //box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.2);
  overflow: hidden;

  transition: 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);

  .FlatCompletion-Item {
    position: relative;
    margin: 5px 0;
    padding: 10px;
    cursor: pointer;

    width: max-content;

    opacity: 0;

    animation: fade-in 0.5s var(--d) cubic-bezier(0.785, 0.135, 0.15, 0.86) forwards;
    transition: 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);

    --fake-opacity: 0.5;
    --fake-radius: 4px;
    border-radius: var(--fake-radius);
    box-sizing: border-box;
    backdrop-filter: blur(16px) saturate(180%);
    &:hover {
      --fake-opacity: 0.8;
    }
    &.remove {
      animation: fade-out 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86) forwards;
    }
  }
}

@keyframes fade-out {
  from {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0) scaleY(1);
  }
  to {
    opacity: 0;
    filter: blur(10px);
    transform: translateY(10px) scaleY(1.1);
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
    filter: blur(10px);
    transform: translateY(10px) scaleY(1.1);
  }
  to {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0) scaleY(1);
  }
}
</style>

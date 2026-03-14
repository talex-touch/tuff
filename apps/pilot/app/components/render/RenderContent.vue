<script setup lang="ts">
import ThContent from '../article/ThContent.vue'

const props = defineProps<{
  data: string
  dotEnable?: boolean
}>()

const color = useColorMode()
const inner = ref()
const dot = ref<HTMLDivElement>()

let timer: any
let dotUpdateTimer: any
let lastDotUpdateAt = 0
const DOT_UPDATE_THROTTLE_MS = 80

function handleGeneratingDotUpdate(rootEl: HTMLElement, cursor: HTMLElement) {
  if (!props.dotEnable || !rootEl || !cursor)
    return

  cursor.style.opacity = '1'
  cursor.style.animation = 'dot-frames 0.5s infinite'
  timer && clearTimeout(timer)
  timer = setTimeout(() => {
    if (props.dotEnable)
      return

    cursor.style.opacity = '0'
    cursor.style.animation = ''
  }, 2200)

  let _remove
  // 移除 rootEl最后一个TextNode
  if (rootEl.lastChild?.nodeType === Node.TEXT_NODE) {
    const data = rootEl.lastChild as Text

    if (!data.nodeValue?.replace('\n', '')) {
      rootEl.lastChild.remove()
      _remove = data
    }
  }

  const textNode = getLastTextNode(rootEl)

  const tempNode = document.createTextNode('|')
  if (textNode)
    textNode.after(tempNode)
  else
    rootEl.appendChild(tempNode)

  const range = document.createRange()
  range.setStart(tempNode, 0)
  range.setEnd(tempNode, 0)
  const rect = range.getBoundingClientRect()
  const textRect = rootEl.getBoundingClientRect()
  // const cursorRect = cursor.getBoundingClientRect()

  const top = rect.top - textRect.top + rect.height / 2 - 4
  const left = rect.left - textRect.left + rect.width / 2 + 4

  Object.assign(cursor!.style, {
    top: `${top}px`,
    left: `${left}px`,
  })

  tempNode.remove()
  if (_remove)
    rootEl.appendChild(_remove)

  // setTimeout(() => handleGeneratingDotUpdate(rootEl, cursor), 20)
}

function clearDotUpdateTimer() {
  if (!dotUpdateTimer) {
    return
  }
  clearTimeout(dotUpdateTimer)
  dotUpdateTimer = null
}

function scheduleGeneratingDotUpdate(rootEl: HTMLElement, cursor: HTMLElement) {
  if (!props.dotEnable || !rootEl || !cursor) {
    return
  }

  const now = Date.now()
  const elapsed = now - lastDotUpdateAt
  if (elapsed >= DOT_UPDATE_THROTTLE_MS) {
    lastDotUpdateAt = now
    handleGeneratingDotUpdate(rootEl, cursor)
    return
  }

  if (dotUpdateTimer) {
    return
  }

  dotUpdateTimer = setTimeout(() => {
    dotUpdateTimer = null
    lastDotUpdateAt = Date.now()
    handleGeneratingDotUpdate(rootEl, cursor)
  }, Math.max(0, DOT_UPDATE_THROTTLE_MS - elapsed))
}

const value = ref('')

watchEffect(() => {
  value.value = props.data

  const el = inner.value
  if (!el)
    return

  const dom = el.querySelector('.MilkContent')

  nextTick(() => scheduleGeneratingDotUpdate(dom, dot.value!))
})

onBeforeUnmount(() => {
  timer && clearTimeout(timer)
  clearDotUpdateTimer()
})
</script>

<template>
  <div ref="inner" class="RenderContent">
    <ThContent v-model="value" readonly />
    <div v-if="dotEnable" ref="dot" class="Generating-Dot" />
  </div>
</template>

<style lang="scss">
.RenderContent {
  .MilkContent {
    padding: 0;
  }
}

.Generating-Dot {
  position: absolute;

  top: 0;
  left: 0;

  width: 8px;
  height: 8px;

  opacity: 0;
  border-radius: 50%;
  pointer-events: none;
  background-color: var(--el-text-color-primary);

  transition: 0.05s cubic-bezier(0.25, 0.8, 0.25, 1);
  // animation: dot-frames 0.5s infinite;
}

@keyframes dot-frames {
  0% {
    opacity: 0;
  }

  50% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
}

// .language-echarts,
.language-abc svg {
  border-radius: 16px;
  background: #ffffff;
}

.language-echarts {
  // padding: 0.5rem 0;
  border-radius: 4px;

  // box-sizing: border-box;
}

.RenderContent {
  position: relative;

  .language-mermaid {
    min-width: 500px;
  }

  // &-Wrapper {
  //   padding-bottom: 1rem;
  // }

  // .el-scrollbar__bar.is-horizontal {
  //   height: 3px;
  //   left: 0;
  // }
  h1 {
    font-size: 1.5rem;
  }

  h2 {
    font-size: 1.25rem;
  }

  h3 {
    font-size: 1.125rem;
  }

  // pre {
  //   margin: 0.5rem 0;
  //   padding: 0.5rem 0.25rem;

  //   max-width: 100%;

  //   overflow-x: scroll;
  //   border-radius: 12px;
  //   background-color: var(--el-bg-color-page);
  // }
  // .language-abc {
  //   margin: 1rem 0;
  // }

  pre code {
    span.hljs-keyword {
      color: #cb5a3d;
      // color: var(--el-color-primary);
    }

    span.hljs-name {
      color: #25aff3;
    }
    // margin: 0 0.25rem;
    // padding: 0.25rem 0.5rem;

    // border-radius: 12px;
    color: var(--el-text-color-primary);
    background-color: var(--el-bg-color-page);
  }

  table {
    th {
      background-color: var(--el-bg-color-page);
    }
    tr {
      border-top: 1px solid var(--el-border-color);
      background-color: var(--el-fill-color-light);
    }

    td,
    th {
      border: 1px solid var(--el-border-color);
    }

    tbody tr:nth-child(2n) {
      background-color: var(--el-fill-color-lighter);
    }
  }
}
</style>

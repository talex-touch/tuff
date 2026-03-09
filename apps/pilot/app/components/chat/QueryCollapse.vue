<script setup lang="ts">
const emits = defineEmits(['expand'])

const expand = ref(false)
// const container = ref<HTMLElement>()

// 根据展开收缩来动态控制大小
// async function handleSize() {
//   // 如果是展开 那么就根据 Header 的大小
//   const containerDom = container.value
//   if (!containerDom) {
//     setTimeout(handleSize, 200)
//     return
//   }

//   console.dir(containerDom)

//   if (expand.value) {
//     containerDom.style.setProperty('--w', '0')
//     containerDom.style.setProperty('--w', `${containerDom.clientWidth}px`)
//   }
//   else {
//     const headerDom = containerDom.querySelector('.QueryCollapse-Header')
//     if (!headerDom) {
//       console.error('headerDom not found')
//       return
//     }

//     containerDom.style.setProperty('--w', '0')
//     containerDom.style.setProperty('--w', `${headerDom.clientWidth}px`)
//   }
// }

watch(() => expand.value, () => emits('expand', expand.value), { immediate: true })
</script>

<template>
  <div ref="container" :class="{ expand }" class="QueryCollapse">
    <div flex items-center gap-2 class="QueryCollapse-Header" @click="expand = !expand">
      <slot name="Header">
        Header
      </slot>
    </div>
    <slot />
  </div>
</template>

<style lang="scss" scoped>
:deep(.hamburger) {
  font-size: 10px;
}

.QueryCollapse {
  &-Header {
    display: flex;

    width: max-content;

    height: 32px;
    align-items: center;
    // margin: 0.5rem 0;

    opacity: 0.5;

    cursor: pointer;
    user-select: none;
  }

  &.expand {
    .QueryCollapse-Header {
      opacity: 0.75;
    }
    max-height: 500px;
  }
  position: relative;

  max-height: 32px;
  // max-width: 100%;
  // width: var(--w, 100%);

  overflow-y: hidden;

  transition:
    // max-width 2.5s ease-in-out,
    // width 2.5s ease-in-out,
    max-height 0.2s ease-in-out;
}
</style>

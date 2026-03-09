<script setup lang="ts">
import { MilkdownProvider } from '@milkdown/vue'
import { ProsemirrorAdapterProvider } from '@prosemirror-adapter/vue'
import Milkdown from '~/components/article/MilkdownEditor.vue'

const model = ref('')
const outline = ref<any[]>()
const editor = ref<HTMLElement>()

function handleOutline(data: any[], el: HTMLElement) {
  outline.value = data
  editor.value = el
}

let _func: any
function handleOnScroll() {
  _func?.()
}

provide('onScroll', (func: any) => _func = func)
</script>

<template>
  <div class="Paper">
    <div class="Paper-Header">
      <p>工作区</p>

      <div class="Paper-Header-Nav">
        <div i-carbon:copy />
      </div>
    </div>

    <div class="Paper-Main">
      <ProsemirrorAdapterProvider>
        <MilkdownProvider>
          <Milkdown v-model="model" :readonly="false" @on-scroll="handleOnScroll" @outline="handleOutline" />
        </MilkdownProvider>
      </ProsemirrorAdapterProvider>
    </div>

    <div class="Paper-Fav">
      <PaperFav />
    </div>
  </div>
</template>

<style lang="scss">
.Paper {
  &-Main {
    // .MilkContent,
    // .milkdown,
    // .ProseMirror {
    //   position: relative;

    //   width: 100%;
    //   height: 100%;
    //   min-height: 100%;
    // }

    :deep(.GuideEditorContainer-MainWrapper) {
      padding: 0;

      width: 100%;
      height: 100%;
    }

    position: relative;

    width: 100%;
    height: 100%;

    flex: 1;
    overflow: hidden;
    // box-shadow: var(--el-box-shadow);
    // background-color: var(--el-bg-color-page);
  }
  z-index: 1;
  position: relative;
  display: flex;

  top: 0;
  left: 0;

  width: 100%;
  height: 100%;

  flex-direction: column;
  justify-content: center;
}

.Paper-Header {
  > p {
    font-weight: 600;
  }
  z-index: 10;
  position: absolute;
  padding: 0 1rem;
  display: flex;

  top: 0;

  height: 50px;
  width: 100%;

  align-items: center;

  justify-content: space-between;
}
</style>

<style lang="scss">
.DefaultTemplate-Container.paper {
  > .el-main {
    padding: 0;
    --el-main-padding: 0;
  }
}
</style>

<script setup lang="ts">
import { MilkdownProvider } from '@milkdown/vue'
import { ProsemirrorAdapterProvider } from '@prosemirror-adapter/vue'
import Milkdown from '~/components/article/MilkdownEditor.vue'

const props = defineProps<{
  modelValue: string
  readonly: boolean
}>()

const emits = defineEmits<{
  (event: 'update:modelValue', data: string): void
  (event: 'save', content: string, callback: Function): boolean
}>()

const model = useVModel(props, 'modelValue', emits)
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

function _handleSave() {
  emits('save', model.value, (res: boolean) => {
    console.log('res', res)
  })
}

const handleSave = useDebounceFn(_handleSave, 500)

watch(() => model.value, (val) => {
  if (!props.readonly && val?.length)
    handleSave()
})

provide('onScroll', (func: any) => _func = func)

function handleKeyDown(event: KeyboardEvent) {
  if (event.ctrlKey && event.key === 's') {
    event.preventDefault()
    handleSave()
  }
}

// 监听键盘Ctrl+S
onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="ThEditor">
    <div class="ThEditor-Aside">
      <el-scrollbar>
        <h1>页面大纲</h1>
        <ArticleContentOutline :editor="editor" :edit-mode="false" :outline="outline" />
      </el-scrollbar>
    </div>

    <div class="ThEditor-Main">
      <ProsemirrorAdapterProvider>
        <MilkdownProvider>
          <Milkdown v-model="model" :readonly="readonly" @on-scroll="handleOnScroll" @outline="handleOutline" />
        </MilkdownProvider>
      </ProsemirrorAdapterProvider>
    </div>

    <div class="ThEditor-Property">
      <h1>文档属性</h1>
      <slot name="property" />
      <el-divider />
      <h1>编写建议</h1>
      <el-empty description="当前文档非常完美！" />
    </div>
  </div>
</template>

<style lang="scss">
.ThEditor {
  &-Property {
    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
    }

    position: relative;
    display: flex;
    padding: 1rem 0.5rem;

    width: 30%;
    max-width: 380px;
    height: max-content;

    gap: 1rem;
    flex-direction: column;

    border-radius: 12px;
    background-color: var(--el-bg-color);
  }

  &-Aside {
    h1 {
      margin: 1rem 0.75rem;
      font-size: 20px;
      font-weight: 600;
    }

    position: relative;
    display: flex;

    width: 30%;
    max-width: 280px;
    height: max-content;

    gap: 1rem;
    flex-direction: column;

    border-radius: 12px;
    background-color: var(--el-bg-color);
  }

  &-Main {
    .MilkContent,
    .milkdown,
    .ProseMirror {
      position: relative;

      width: 100%;
      height: 100%;
      min-height: 100%;
    }

    .GuideEditorContainer-MainWrapper {
      width: 100%;
      height: 100%;
    }

    position: relative;
    // margin: 0 auto;

    // width: 80%;
    max-width: 850px;
    height: 100%;

    flex: 1;
    overflow: hidden;
    border-radius: 12px;
    box-shadow: var(--el-box-shadow);
    background-color: var(--el-bg-color);
  }

  position: relative;
  padding: 1rem;
  display: flex;

  top: 0;
  left: 0;

  width: 100%;
  height: 100%;

  gap: 1rem;
  justify-content: center;

  background-color: var(--el-bg-color-page);
}
</style>

<script lang="ts" name="FlatMarkdown" setup>
import { defaultValueCtx, Editor, editorViewOptionsCtx, rootCtx } from '@milkdown/core'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { commonmark } from '@milkdown/preset-commonmark'
import { nord } from '@milkdown/theme-nord'
import { replaceAll } from '@milkdown/utils'
import { useModelWrapper } from '@talex-touch/utils/renderer/ref'
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import '@milkdown/theme-nord/style.css'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    readonly?: boolean
  }>(),
  {
    modelValue: '',
    readonly: false,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const value = useModelWrapper(props, emit)
const editor = shallowRef<Editor | null>(null)
const editorDom = ref<HTMLElement>()
const editorReady = ref(false)
let internalUpdate = false

async function initEditor(): Promise<void> {
  if (!editorDom.value)
    return
  if (editor.value) {
    await editor.value.destroy()
    editor.value = null
  }

  // @ts-ignore: Milkdown plugin type compatibility issue
  const instance = await Editor.make()
    // @ts-ignore
    .config((ctx) => {
      ctx.set(rootCtx, editorDom.value)
      ctx.set(defaultValueCtx, value.value ?? '')
      ctx.update(editorViewOptionsCtx, prev => ({
        ...prev,
        editable: () => !props.readonly,
      }))
      ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
        if (markdown === value.value)
          return
        internalUpdate = true
        value.value = markdown
      })
    })
    // @ts-ignore
    .use(nord)
    .use(commonmark)
    // @ts-ignore
    .use(listener)
    .create()

  editor.value = instance
  editorReady.value = true
}

function applyMarkdown(markdown: string): void {
  if (!editorReady.value || !editor.value)
    return
  editor.value.action(replaceAll(markdown, true))
}

watch(
  () => value.value,
  (next, prev) => {
    if (!editorReady.value || internalUpdate) {
      internalUpdate = false
      return
    }
    if (next === prev)
      return
    applyMarkdown(next ?? '')
  },
)

watch(
  () => props.readonly,
  (readonly) => {
    if (!editorReady.value || !editor.value)
      return
    editor.value.action((ctx) => {
      ctx.update(editorViewOptionsCtx, prev => ({
        ...prev,
        editable: () => !readonly,
      }))
    })
  },
)

onMounted(() => {
  void initEditor()
})

onBeforeUnmount(async () => {
  if (editor.value) {
    await editor.value.destroy()
    editor.value = null
  }
})
</script>

<template>
  <div class="FlatMarkdown-Container fake-background">
    <el-scrollbar>
      <div ref="editorDom" class="FlatMarkdown-Editor" />
    </el-scrollbar>
  </div>
</template>

<style lang="scss" scoped>
:deep(.milkdown) {
  position: relative;

  .ProseMirror {
    &:focus-visible {
      outline: none;
    }

    overflow-y: auto;
    display: flex;
    flex-direction: column;

    height: 100%;

    p {
      font-weight: 400;

      font-size: 14px;
      text-align: left;
    }
  }

  position: relative;
  height: 100%;

  h1 {
    &:before {
      z-index: -1;
      content: '';
      position: absolute;

      left: 50%;
      top: 0;

      width: 120%;
      height: 100%;

      transform: translateX(-50%) skewX(-15deg);
      background-color: var(--el-color-primary-light-7);
    }

    position: relative;
    display: inline-block;

    align-self: center;

    text-align: center;
  }

  ul {
    li {
      p {
        font-size: 14px;
        text-align: left;
      }
    }
  }

  blockquote {
    margin: 10px 0px;
    box-sizing: border-box;

    width: calc(100% - 10px);

    border-radius: 0 4px 4px 0;
    border-left: 3px solid var(--el-color-primary);
    background-color: var(--el-fill-color);
    position: relative;
  }

  code {
    color: var(--el-color-primary-dark-2);

    padding: 2px 4px;
    border-radius: 4px 4px;
    background-color: var(--el-fill-color);
  }

  a {
    &:visited {
      color: var(--el-color-primary);
    }

    color: var(--el-color-primary-dark-2);
  }
}

.FlatMarkdown-Container {
  .FlatMarkdown-Editor {
    position: relative;

    width: 100%;
    height: 100%;

    box-sizing: border-box;
  }

  :deep(.el-scrollbar) {
    .el-scrollbar__view {
      min-height: 100%;
    }
    height: 100%;
  }

  &:hover {
    border-color: var(--el-color-primary-light-7);
  }

  &:focus-visible {
    border-color: var(--el-color-primary);
  }

  position: relative;
  padding-left: 10px;

  width: 100%;
  height: 100%;

  box-sizing: border-box;
  //border: 1px solid var(--el-border-color);
}
</style>

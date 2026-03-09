<script setup lang="ts">
import { Milkdown, useEditor } from '@milkdown/vue'
import { Editor, defaultValueCtx, editorViewOptionsCtx, rootCtx } from '@milkdown/core'
import { nord } from '@milkdown/theme-nord'
import { blockquoteKeymap, blockquoteSchema, codeBlockSchema, commonmark } from '@milkdown/preset-commonmark'
import './style.scss'

import { gfm } from '@milkdown/preset-gfm'
import { listener, listenerCtx } from '@milkdown/plugin-listener'

import type { Uploader } from '@milkdown/plugin-upload'
import { upload, uploadConfig } from '@milkdown/plugin-upload'
import { history } from '@milkdown/plugin-history'
import { clipboard } from '@milkdown/plugin-clipboard'
import { trailing } from '@milkdown/plugin-trailing'
import { keymap as createKeymap } from '@milkdown/prose/keymap'
import { TooltipProvider, tooltipFactory } from '@milkdown/plugin-tooltip'
import { SlashProvider, slashFactory } from '@milkdown/plugin-slash'
import { prism, prismConfig } from '@milkdown/plugin-prism'
import { $view, getMarkdown, outline, replaceAll } from '@milkdown/utils'
import { undoInputRule } from '@milkdown/prose/inputrules'
import '@milkdown/theme-nord/style.css'

import 'prism-themes/themes/prism-nord.css'

import markdown from 'refractor/lang/markdown'
import css from 'refractor/lang/css'
import javascript from 'refractor/lang/javascript'
import typescript from 'refractor/lang/typescript'
import jsx from 'refractor/lang/jsx'
import tsx from 'refractor/lang/tsx'
import cpp from 'refractor/lang/cpp'
import c from 'refractor/lang/c'
import python from 'refractor/lang/python'
import java from 'refractor/lang/java'
import { useNodeViewFactory } from '@prosemirror-adapter/vue'
import EditorCodeBlock from '~/components/article/components/EditorCodeBlock.vue'
import EditorBlockQuote from '~/components/article/components/EditorBlockQuote.vue'
import { $endApi } from '~/composables/api/base'
import { globalOptions } from '~/constants'

const props = defineProps<{
  modelValue: string
  readonly: boolean
}>()

const emits = defineEmits<{
  (event: 'update:modelValue', data: string): void
  (event: 'outline', data: any, el: HTMLElement): void
  (event: 'onScroll', data: any): void
}>()

const editorDom = ref<HTMLElement>()
const model = useVModel(props, 'modelValue', emits)

function useSlashPluginView(view: any) {
  const contentDom = document.createElement('div')

  const slashProvider = new SlashProvider({
    content: contentDom,
  })

  return {
    update: (updatedView: any, prevState: any) => {
      slashProvider.update(updatedView, prevState)
    },
    destroy: () => {
      slashProvider.destroy()
      contentDom.remove()
    },
  }
}

function tooltipPluginView(view: any) {
  const content = document.createElement('div')

  const provider = new TooltipProvider({
    content,
  })

  return {
    update: (updatedView: any, prevState: any) => {
      provider.update(updatedView, prevState)
    },
    destroy: () => {
      provider.destroy()
      content.remove()
    },
  }
}

const uploader: Uploader = async (files, schema) => {
  const images: File[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files.item(i)
    if (!file)
      continue

    // You can handle whatever the file type you want, we handle image here.
    if (!file.type.includes('image'))
      continue

    images.push(file)
  }

  const nodes: Node[] = await Promise.all(
    images.map(async (image) => {
      const result = await $endApi.v1.common.upload(image)

      const alt = image.name
      const src = `${globalOptions.getEndsUrl()}${result.data.filename}`

      return schema.nodes.image.createAndFill({
        src,
        alt,
      }) as any
    }),
  )

  return nodes
}

// function overrideBaseKeymap(keymap: Record<string, Command>) {
//   const handleBackspace = chainCommands(
//     undoInputRule,
//     deleteSelection,
//     joinBackward,
//     selectNodeBackward,
//   )
//   keymap.Backspace = handleBackspace
//   return keymap
// }

const nodeViewFactory = useNodeViewFactory()

const slash = slashFactory('my-slash')
const tooltip = tooltipFactory('my-tooltip')

const editor = useEditor((root) => {
  return Editor.make()
    .config(nord)
    .config((ctx) => {
      ctx.set(rootCtx, root)
      // ctx.set(defaultValueCtx, content.value)

      ctx.update(editorViewOptionsCtx, prev => ({
        ...prev,
        editable: () => !props.readonly,
      }))

      ctx.set(slash.key, {
        view: useSlashPluginView,
      })

      ctx.set(tooltip.key, {
        view: tooltipPluginView,
      })

      // ctx.set(blockquoteKeymap.key, {
      //   // undo

      // })

      ctx.set(prismConfig.key, {
        configureRefractor: (refractor) => {
          refractor.register(markdown)
          refractor.register(css)
          refractor.register(javascript)
          refractor.register(typescript)
          refractor.register(jsx)
          refractor.register(tsx)
          refractor.register(cpp)
          refractor.register(c)
          refractor.register(python)
          refractor.register(java)
        },
      })

      ctx.update(uploadConfig.key, prev => ({
        ...prev,
        uploader,
      }))

      const listener = ctx.get(listenerCtx)

      let _updating = false
      watch(() => model.value, () => {
        if (_updating || !editor.get())
          return

        editor.get()?.action(replaceAll(model.value))
      })

      // watchEffect(() => {

      //   // get current markdown
      //   const markdown = editor.get()!.action(getMarkdown())

      //   console.log('editor', markdown, model.value, markdown === model.value, JSON.stringify(markdown), JSON.stringify(model.value))

      //   editor.get()?.action(replaceAll(model.value))
      // })

      let timer: any
      function _updateModelValue(markdown: string) {
        _updating = true
        model.value = markdown

        const _outline = editor.get()!.action(outline)(ctx)

        emits('outline', _outline, editorDom.value)

        setTimeout(() => _updating = false, 100)
      }

      listener.markdownUpdated((ctx, markdown, prevMarkdown) => {
        if (markdown === prevMarkdown)
          return

        clearTimeout(timer)
        timer = setTimeout(() => _updateModelValue(markdown), 100)
      })
    })
    .use(commonmark)
    .use(slash)
    .use(tooltip)
    .use(gfm)
    .use(clipboard)
    .use(commonmark)
    .use(history)
    .use(prism)
    .use(trailing)
    .use(listener)
    .use(upload)
    .use(
      $view(codeBlockSchema.node, () => nodeViewFactory({ component: EditorCodeBlock })),
    )
    .use(
      $view(blockquoteSchema.node, () => nodeViewFactory({ component: EditorBlockQuote })),
    )
})
</script>

<template>
  <div class="GuideEditorContainer">
    <!-- <div class="GuideEditorContainer-Main"> -->
    <el-scrollbar @scroll="emits('onScroll', $event)">
      <div class="GuideEditorContainer-MainWrapper">
        <Milkdown ref="editorDom" class="MilkContent" />
      </div>
    </el-scrollbar>
    <!-- </div> -->
  </div>
</template>

<style lang="scss">
.GuideEditorContainer {
  &-MainWrapper {
    // position: relative;
    margin: 0 auto;
    padding: 1rem 1.25rem;

    width: 1280px;
    max-width: 80%;
  }

  // .el-scrollbar__bar.is-vertical {
  //   width: 4px;
  // }

  .ProseMirror {
    min-height: calc(100vh - 4rem);
  }

  .el-scrollbar__view,
  .el-scrollbar {
    // position: relative;

    width: 100%;
    min-height: 100%;
  }

  &-Main {
    padding: absolute;
    padding: 1rem 0.25rem;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    overflow: hidden;
    background-color: var(--el-bg-color-page);
  }
  padding: relative;

  width: 100%;
  height: 100%;
}
</style>

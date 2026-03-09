<script setup>
import { Editor, defaultValueCtx, editorViewOptionsCtx, rootCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { listenerCtx } from '@milkdown/plugin-listener'
import { nord } from '@milkdown/theme-nord'
import { prism, prismConfig } from '@milkdown/plugin-prism'
import { outline, replaceAll } from '@milkdown/utils'
import { katexOptionsCtx, math } from '@milkdown/plugin-math'
import '@milkdown/theme-nord/style.css'
import '~/components/render/style.css'

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
import { useRichArticle } from '~/composables/rich-article.ts'
import 'katex/dist/katex.min.css'

const props = defineProps(['content', 'disableRich'])
const emits = defineEmits(['outline'])

const editorDom = ref()

onMounted(async () => {
  const editor = await Editor.make()
    .config((ctx) => {
      // ctx.set(defaultValueCtx, props.content)
      ctx.set(rootCtx, editorDom.value)

      ctx.set(katexOptionsCtx.key, {

      })

      ctx.update(editorViewOptionsCtx, prev => ({
        ...prev,
        editable: () => false,
      }))

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
    })
    .use(commonmark)
    .use(prism)
    .use(math)
    .create()

  watchEffect(() => {
    editor.action(replaceAll(props.content))

    if (props.disableRich)
      return

    setTimeout(() => {
      useRichArticle(editorDom.value)

      const _outline = editor.action(outline)(editor.ctx)

      emits('outline', _outline)
    }, 10)
  })
})
</script>

<template>
  <div ref="editorDom" class="MilkContent markdown-body milkdown-theme-nord prose" />
</template>

<style lang="scss">
@import './style.scss';
</style>

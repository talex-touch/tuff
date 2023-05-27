<template>
  <div class="FlatMarkdown-Container fake-background">
    <el-scrollbar>
      <div class="FlatMarkdown-Editor" ref="editorDom" />
    </el-scrollbar>
  </div>
</template>

<script>
export default {
  name: "FlatMarkdown"
}
</script>

<script setup>
import { defaultValueCtx, Editor, editorViewOptionsCtx, rootCtx } from '@milkdown/core';
import { nord } from '@milkdown/theme-nord'
import { commonmark } from '@milkdown/preset-commonmark'
import { replaceAll } from '@milkdown/utils'
import { onMounted, ref } from "vue";
import { useModelWrapper } from 'utils/renderer/ref';
import '@milkdown/theme-nord/style.css'

const props = defineProps(["modelValue", "readonly"])
const emit = defineEmits(["update:modelValue"])

const value = useModelWrapper(props, emit)

const editor = ref()
const editorDom = ref()

watch(value, () => {
  editor.value?.action(replaceAll(value.value))
})

onMounted(async () => {
  editor.value = await Editor.make().config(ctx => {
    ctx.set(rootCtx, editorDom.value)
    ctx.set(defaultValueCtx, value.value)

    ctx.update(editorViewOptionsCtx, prev => ({
      ...prev,
      editable: () => !props.readonly
    }))
  }).use(nord).use(commonmark).create()

})

</script>

<style lang="scss" scoped>
:deep(.milkdown) {
  .ProseMirror {
    &:focus-visible {
      outline: none;
    }

    display: flex;
    flex-direction: column;

    height: 100%;

    p {
      font-weight: 400;

      font-size: 14px;
      text-align: left;
    }
  }

  height: 100%;

  h1 {
    &:before {
      z-index: -1;
      content: "";
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
    margin: 10px 0;

    border-radius: 0 4px 4px 0;
    border-left: 3px solid var(--el-color-primary);
    background-color: var(--el-fill-color);
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
      height: 100%;
    }

    height: 100%;
  }

  &:hover {
    border-color: var(--el-color-primary-light-7)
  }

  &:focus-visible {
    border-color: var(--el-color-primary)
  }

  position: relative;
  padding-left: 10px;

  width: 100%;
  height: 100%;

  box-sizing: border-box;
  //border: 1px solid var(--el-border-color);
}
</style>
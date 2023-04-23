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
import { onMounted, ref } from "vue";
import { useModelWrapper } from "@modules/utils";

const props = defineProps(["modelValue", "readonly"])
const emit = defineEmits(["update:modelValue"])

const value = useModelWrapper(props, emit)

const editor = ref()
const editorDom = ref()

onMounted(() => {
  editor.value = Editor.make().config(ctx => {
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
.FlatMarkdown-Container {
  .FlatMarkdown-Editor {
    :deep(.milkdown) {
      .ProseMirror {
        &:focus-visible {
          outline: none;
        }
        height: 100%;
      }
      height: 100%;
    }
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
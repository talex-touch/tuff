<template>
  <div class="PluginInfo-Container" :class="{ 'wrapper-view': wrapperView }">
    <plugin-status :plugin="plugin" />

    <FormTemplate>
      <template #header>
        <div grid gap-4 grid-cols-8 items-center>
          <div col-span-6>
            <p my-4 font-extrabold text-2xl>
              {{ plugin.name }}
            </p>
            <span block text="base" op-75 font-normal>{{ plugin.desc }}</span>
          </div>

          <FlatButton h-5 w-2 @click="handleExport" class="plugin-export" v-if="plugin.dev?.enable">
            Export
          </FlatButton>
        </div>
      </template>
      <BlockTemplate title="Overview">
        <LineTemplate title="dev">
          <span text-sm v-if="plugin.dev?.enable" class="plugin-dev">{{ $t('version.dev') }}</span>
          <span v-else>-</span>
        </LineTemplate>
        <LineTemplate title="version">
          {{ plugin.version }}
        </LineTemplate>
        <LineTemplate v-if="plugin.dev" title="address">
          {{ plugin.dev?.address }}
        </LineTemplate>
      </BlockTemplate>

      <BlockTemplate :style="`padding-right: 1.25rem`" v-if="plugin.readme" title="Readme">
        <FlatMarkdown :readonly="true" v-model="readme" />
      </BlockTemplate>
    </FormTemplate>
  </div>
</template>

<script lang="ts" name="PluginInfo" setup>
import PluginStatus from '@comp/plugin/action/PluginStatus.vue'
import FlatButton from "@comp/base/button//FlatButton.vue";
import FlatMarkdown from "@comp/base/input/FlatMarkdown.vue";
import FormTemplate from '@comp/base/template/FormTemplate.vue'
import BlockTemplate from '@comp/base/template/BlockTemplate.vue'
import LineTemplate from '@comp/base/template/LineTemplate.vue'
import { popperMention } from '@modules/mention/dialog-mention'
import type { ITouchPlugin } from '@talex-touch/utils/plugin'

const props = defineProps({
  plugin: {
    type: Object as PropType<ITouchPlugin>,
    required: true
  }
})

const readme = computed<string>(() => props.plugin.readme)

async function handleExport() {
  await popperMention("Attention", "The export is abandoned\nSee our docs for more information!")
}
</script>

<style lang="scss" scoped>
.ConfigSource-Editor {
  :deep(.cm-editor) {
    .cm-gutters {
      opacity: .75;
      background: transparent;
      //background-color: var(--el-fill-color-lighter) !important;
    }

    .cm-scroller {
      font-family: "Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", Arial, sans-serif;
      font-size: 14px;
    }

    .cm-foldGutter {
      span[title="Fold line"] {
        position: relative;

        top: -5px
      }
    }

    .cm-line {
      color: var(--el-text-color-primary);
    }

    .ͼe {
      color: var(--el-color-danger-dark-2);
    }

    .ͼc {
      color: var(--el-color-primary-dark-2);
    }

    .cm-selectionBackground,
    &::selection {
      background-color: var(--el-color-primary-light-9) !important;
    }
  }
}

.plugin-action {
  margin-left: 30px;
}

:deep(.el-scrollbar) {
  position: relative;

  height: calc(100% - 10px);

}

.plugin-version {
  display: inline;
  padding: 2px 4px;

  width: max-content;
  border-radius: 4px;

  background: #FE9F0E;
  color: #fff;
  box-sizing: border-box;
}

.plugin-dev {
  display: inline;
  padding: 4px 8px;

  width: max-content;

  color: #eee;

  box-sizing: border-box;
  border-radius: 4px;
  background-color: black;
}

.PluginInfo-Container {
  //&.wrapper-view {
  //  transform: perspective(10px) rotateX(90deg);
  //}
  position: relative;

  display: flex;
  flex-direction: column;

  height: 100%;

  :deep(.el-tabs) {
    position: relative;

    height: calc(100% - 120px);

    .el-tabs__content,
    .el-tab-pane {
      position: relative;

      height: calc(100% - 11px);
    }

    .el-tabs__active-bar,
    .el-tabs__nav-wrap:after {
      height: 1px;
    }

    .el-tabs__nav-scroll {
      width: 90%;
      left: 5%;

      position: relative;
    }

    .el-tabs__header {
      margin-bottom: 0;
    }
  }

  box-sizing: border-box;

}
</style>

<style>
.Plugin-Container:has(.wrapper-view) {
  filter: blur(10px);
  transform: perspective(100px) rotateX(9deg);
}
</style>
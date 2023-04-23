<template>
  <div class="PluginInfo-Container" :class="{ 'wrapper-view': wrapperView }">
    <plugin-status :plugin="plugin" />

    <div class="PluginInfo-Header">
      <span class="plugin-tags" style="display: flex;gap: 8px">
        <span class="plugin-version">{{ plugin.pluginInfo.version }}</span>
        <span v-if="plugin.pluginInfo.pluginSubInfo?.dev?.enable" class="plugin-dev">{{ $t('version.dev') }}</span>
      </span>

      <p class="plugin-name">
        {{ plugin.pluginInfo.name }}
      </p>

      <FlatButton @click="wrapperView = !wrapperView" class="plugin-export" v-if="plugin.pluginInfo.pluginSubInfo?.dev?.enable">
        打包
      </FlatButton>
    </div>

    <el-tabs v-model="tabs">
      <el-tab-pane label="概述" name="overview">
        <FlatMarkdown v-model="plugin.readme" />
      </el-tab-pane>
      <el-tab-pane v-if="false" label="作者" name="authors">
        <div class="Authors-Wrapper">
          <el-scrollbar>
            <div class="Authors-Container">
              <div v-for="author in plugin.pluginInfo.authors" class="Author-Item">
                <ProfileAvatar v-if="author.qq" :username="author.name" :image="`http://q1.qlogo.cn/g?b=qq&nk=${author.qq}&s=640`" />
                <ProfileAvatar v-else :username="author.name" />

                <p v-if="author.position" class="position">{{ author.position }}</p>

                <div class="Author-Brief">
                  <p>{{ author.name }}</p>

                  <div class="Author-Introduction">
                    {{ author.introduction }}
                  </div>
                </div>

                <div class="Author-Content">
                  <icon-button plain small display="popover" v-for="item in icons" :icon="item.icon" @click="item.click(author[item.property])" />
                </div>
              </div>
            </div>
          </el-scrollbar>
        </div>
      </el-tab-pane>
      <el-tab-pane label="版本" name="history">
        <el-empty description="暂无历史发布版本." />
      </el-tab-pane>
      <el-tab-pane label="评论" name="reviews">
        <el-empty description="暂无历史发布版本." />
      </el-tab-pane>
<!--      <el-tab-pane label="运行日志" name="terminal">-->
<!--        <LogTerminal :logs="plugin.logs" />-->
<!--        <el-empty description="暂无历史日志." />-->
<!--      </el-tab-pane>-->
      <el-tab-pane label="配置" name="config-source">
        <el-scrollbar>
          <div class="ConfigSource-Editor" ref="codeRef" />
        </el-scrollbar>
      </el-tab-pane>

    </el-tabs>

    <teleport to=".AppLayout-View" :disabled="!plugin">
      <PluginWrapper v-if="plugin" v-model="wrapperView" :plugin="plugin" />
    </teleport>
  </div>
</template>

<script>
export default {
  name: "PluginInfo"
}
</script>

<script setup>
import { onBeforeUnmount, onMounted, onUpdated, ref, watchEffect } from 'vue'
import ProfileAvatar from 'vue-profile-avatar'
import RemixIcon from '@comp/icon/RemixIcon.vue'
import { ElMessage } from 'element-plus'
import IconButton from '@comp/button/IconButton.vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Facet } from '@codemirror/state'
import { json } from '@codemirror/lang-json'
import PluginIcon from '@comp/plugin/PluginIcon.vue'
import PluginStatus from '@comp/plugin/action/PluginStatus.vue'
import { registerTypeProcess } from '@modules/samples/node-api'
import FlatButton from "@comp/button/FlatButton.vue";
import PluginWrapper from "@comp/plugin/action/PluginWrapper.vue";
import FlatMarkdown from "@comp/input/FlatMarkdown.vue";

const tabs = ref("overview")
const props = defineProps({
  plugin: {
    type: Object,
    required: true
  }
})

const wrapperView = ref()
const codeRef = ref()

onMounted(() => {

  const editor = new EditorView({
    parent: codeRef.value,
    state: EditorState.create({
      doc: (props.plugin.sourceConfig),
      extensions: [basicSetup, json(), EditorState.readOnly.of(true)],

    })
  })

})

const icons = [
  {
    property: 'email',
    icon: 'mail',
    click: (value) => {

      ElMessage({
        message: value,
        type: 'success'
      })

    }
  },
  {
    property: 'qq',
    icon: 'qq',
    click: (value) => {

      ElMessage({
        message: value,
        type: 'success'
      })

    }
  },
  {
    property: 'website',
    icon: 'pages',
    click: (value) => {

      ElMessage({
        message: value,
        type: 'success'
      })

    }
  },
  {
    property: 'local',
    icon: 'map-pin-2',
    click: (value) => {

      ElMessage({
        message: value,
        type: 'success'
      })

    }
  },
]

const rate = ref(0)

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
    .cm-selectionBackground, &::selection {
      background-color: var(--el-color-primary-light-9) !important;
    }
  }
}

.plugin-action {
  margin-left: 30px;
}

.Authors-Wrapper {
  position: relative;
  padding-left: 1%;

  width: 100%;
  height: 100%;

  box-sizing: border-box;
  .Authors-Container {
    display: flex;

    justify-content: space-around;
    flex-wrap: wrap;

    width: 100%;
  }
  :deep(.el-scrollbar) {
    width: 100%;
    .el-row {
      margin: 0 !important;
    }
  }
}

.Author-Item {
  position: relative;
  padding: 1% 2%;
  margin: 10px 0;
  display: flex;
  flex-direction: column;

  align-items: center;
  box-sizing: border-box;
  border-radius: 8px;
  box-shadow: var(--el-box-shadow-light);
  background-color: var(--el-fill-color-lighter);

  width: 30%;
  :deep(.avatarContainer) {
    span.text {
      display: block;

      padding-top: 40%;
      padding-bottom: 35%;
    }
    position: relative;

    height: auto;
    width: 40%;

    border: none;
    box-shadow: var(--el-box-shadow);
  }
  .position {
    position: absolute;
    padding: 2px 6px;

    top: 35%;

    font-weight: normal;
    font-size: 14px;
    color: var(--el-text-color-regular);

    border-radius: 8px;
    transform: translateY(-40%) scale(.8);
    background-color: var(--el-fill-color-dark);
  }
  .Author-Brief {
    p {
      margin: 0;
      font-size: 16px;
      font-weight: 400;
      text-align: center;
    }
    margin-top: 5%;
    width: 85%;
    padding: 0 10px;
    .Author-Introduction {
      margin: 0;

      text-align: center;
      font-size: 14px;
    }
  }

  .Author-Content {
    //:deep(.IconButton-Container) {
    //
    //  width: 24px;
    //  height: 24px;
    //  line-height: 24px;
    //
    //  box-shadow: none;
    //  background-color: transparent;
    //  border-radius: 4px 4px 0 0;
    //}
    position: relative;
    display: flex;
    padding: 2px 8px;

    justify-content: space-around;

    width: 80%;

    border-radius: 4px 4px 0 0;
  }
}

:deep(.el-scrollbar) {
  position: relative;

  height: calc(100% - 10px);

}

.PluginInfo-Header {
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
  .plugin-name {
    margin: 15px 0;

    width: max-content;

    font-size: 24px;
    font-weight: 600;

    grid-column: 1;
    grid-row: 2;

    box-sizing: border-box;
  }
  .plugin-export {
    position: absolute;

    width: 120px;

    right: 4%;
  }
  position: relative;
  display: flex;
  padding: 4%;

  flex-direction: column;
  justify-content: center;

  width: 100%;

  font-size: 12px;

  box-sizing: border-box;
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

    .el-tabs__content, .el-tab-pane {
      position: relative;

      height: calc(100% - 11px);
    }

    .el-tabs__active-bar, .el-tabs__nav-wrap:after {
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

.Plugin-Container {
    transition: .5s cubic-bezier(0.785, 0.135, 0.150, 0.860);
}
</style>
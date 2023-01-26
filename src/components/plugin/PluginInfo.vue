<template>
  <div class="PluginInfo-Container">
    <div class="PluginInfo-Header">
      <div class="plugin-main">
        <PluginIcon :icon="plugin.pluginInfo.icon" :alt="plugin.pluginInfo.name" />
<!--        <img :alt="plugin.pluginInfo.name" src="@assets/TalexTouchChat-Small.png" />-->

        <div class="plugin-wrapper">
          <p class="plugin-name">
            {{ plugin.pluginInfo.name }}
            <span class="plugin-version">{{ plugin.pluginInfo.version }}</span>
          </p>

          <p class="plugin-info">
            <span class="plugin-info-label">
              <RemixIcon name="download-cloud-2" />
              <span>3,101,537</span>
            </span>
            <span class="plugin-info-label">
              <el-rate v-model="rate" />
            </span>
          </p>

          <p class="plugin-description">
            {{ plugin.pluginInfo.description }}
          </p>
        </div>

        <div class="plugin-action">
          <el-radio-group v-model="pluginState">
            <el-radio-button label="启用" />
            <el-radio-button label="禁用" />
            <el-radio-button label="卸载" />
            <el-radio-button @click="reloadPlugin" label="重载" />
          </el-radio-group>
        </div>

      </div>
    </div>

    <el-tabs v-model="tabs">
      <el-tab-pane label="概述" name="overview">
        {{ plugin.pluginInfo.pluginSubInfo }}
      </el-tab-pane>
      <el-tab-pane label="作者" name="authors">
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
<!--      <el-tab-pane label="历史版本" name="history">-->
<!--        <el-empty description="暂无历史发布版本." />-->
<!--      </el-tab-pane>-->
<!--      <el-tab-pane label="运行日志" name="terminal">-->
<!--        <LogTerminal :logs="plugin.logs" />-->
<!--        <el-empty description="暂无历史日志." />-->
<!--      </el-tab-pane>-->
      <el-tab-pane label="配置源文件" name="config-source">
        <el-scrollbar>
          <div class="ConfigSource-Editor" ref="codeRef" />
        </el-scrollbar>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script>
export default {
  name: "PluginInfo"
}
</script>

<script setup>
import { onMounted, ref } from 'vue'
import ProfileAvatar from 'vue-profile-avatar'
import RemixIcon from '@comp/icon/RemixIcon.vue'
import LogTerminal from '@comp/terminal/LogTerminal.vue'
import { ElMessage } from 'element-plus'
import IconButton from '@comp/button/IconButton.vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Facet } from '@codemirror/state'
import { json } from '@codemirror/lang-json'
import PluginIcon from '@comp/plugin/PluginIcon.vue'
import { pluginManager } from '@modules/samples/node-api'

const tabs = ref("overview")
const props = defineProps({
  plugin: {
    type: Object,
    required: true
  }
})

async function reloadPlugin() {
  console.log( await pluginManager.reloadPlugin(props.plugin.pluginInfo.name)
      .then(() => {
        ElMessage.success("重载成功")
      })
      .catch((e) => {
        console.error(e)
        ElMessage.error("重载失败")
      }))
}

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
const pluginState = ref("启用")

</script>

<style lang="scss" scoped>

.ConfigSource-Editor {
  :deep(.cm-editor) {
    .cm-gutters {
      background-color: var(--el-fill-color-lighter) !important;
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

.plugin-main {
  display: flex;
  align-items: center;

  height: 120px;
  .PluginIcon-Container {
    margin-right: 15px;
    padding: 8px;

    height: 72px;
    width: 72px;

    aspect-ratio: 1 / 1;
    :deep(.remix) {
      font-size: 78px;
    }
  }
  .plugin-wrapper {
    .plugin-name {
      .plugin-version {
        padding: 4px 8px;

        color: var(--el-text-color-secondary);
        font-size: 12px;
        border-radius: 8px;
        background-color: var(--el-fill-color);
      }
      margin: 0;

      font-weight: 600;
      font-size: 24px;
      color: var(--el-color-primary);
    }
    .plugin-info {
      margin: 0;

      opacity: .85;
      .plugin-info-label {
        &:last-child {
          border-right: none;
        }
        span {
          position: relative;
          margin-left: 5px;

          top: -2px;
        }
        margin-right: 10px;
        padding-right: 10px;

        border-right: 1px solid var(--el-border-color-darker);
        //vertical-align: middle;
      }
    }
    .plugin-description {
      margin: 0;

      font-weight: 400;
      font-size: 16px;
    }
  }
}

.PluginInfo-Container {
  position: relative;

  display: flex;
  flex-direction: column;

  height: 100%;
  .PluginInfo-Header {
    position: relative;
    padding: 0 2%;

    width: 100%;
    height: 120px;

    box-sizing: border-box;
  }
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
  padding: 5px 0;

  box-sizing: border-box;
}
</style>
<template>
  <div class="PluginWrapper-Wrapper fake-background" :class="{ visible: visible || pluginWrapper.packaging }">
    <span @click="visible = pluginWrapper.packaging || false" class="PluginWrapper-Referrer" />
    <div class="PluginWrapper-Container">
      <div class="Pack-Main" v-if="!pluginWrapper.packaging">
        <FileTree v-model="pluginWrapper.files" :fileAdpoter="fileAdpoter" />

        <!--       <el-alert class="pack-alert" title="选择你要打包的文件" type="info" />-->
        <FlatButton @click="pack" type="primary">打包</FlatButton>
      </div>

      <div v-else class="Pack-Compressing">
        <LogTerminal :logs="pluginWrapper.log" />
        <div class="Pack-Progressing" :style="`--p: ${pluginWrapper.p.p}%`">
          <div>
            <span v-if="pluginWrapper?.p?.p">
              {{ (pluginWrapper.p.p)?.toFixed?.(4) }} %
            </span>
            <PluginExportMention />
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script>
export default {
  name: "PluginWrapper"
}
</script>

<script setup>
import { genFileAdpoter, pluginPath } from "@modules/hooks/adopters/file-adpoters";
import { useModelWrapper } from 'utils/renderer/ref';
import { reactive } from "vue";
import FileTree from "@comp/tree/FileTree.vue";
import FlatButton from "@comp/base/button//FlatButton.vue";
import { pluginManager } from "@modules/channel/plugin-core/api";
import { blowMention } from "@modules/mention/dialog-mention";
import PluginExportMention from "@comp/plugin/action/mention/PluginExportMention.vue";
import LogTerminal from "@comp/terminal/LogTerminal.vue";
import { touchChannel  } from "@modules/channel/channel-core";

const props = defineProps(["plugin", "modelValue"])
const emit = defineEmits(["update:modelValue"])

const visible = useModelWrapper(props, emit)

const fileAdpoter = genFileAdpoter(pluginPath, props.plugin.name)

const pluginWrapper = reactive({
  packaging: false,
  name: props.plugin.name,
  manifest: props.plugin,
  files: ['init.json', 'index.html'],
  p: {
    n: 0,
    m: 0,
    p: 0
  },
  log: []
})

touchChannel.regChannel('plugin-packager-progress-log/' + pluginWrapper.name, ({ data }) => {
  pluginWrapper.packaging = true

  console.log(data)

  pluginWrapper.log.push(data.log)
})

touchChannel.regChannel('plugin-packager-progress/' + pluginWrapper.name, ({ data }) => {
  pluginWrapper.packaging = true
  pluginWrapper.p.m = data.total
  pluginWrapper.p.n = data.received

  const _p = ((data.received / data.total) * 100).toFixed(7)

  console.log(_p)

  pluginWrapper.p.p = _p
})

let suc = false
touchChannel.regChannel('plugin-packager', async ({ data }) => {
  if (suc) return
  suc = true
  if (!pluginWrapper.packaging) return suc = false
  if (data.plugin === pluginWrapper.name) {
    // pluginWrapper.packaging = false

    if (data.status === 'success') {
      await blowMention('success', '导出成功！')
    } else {
      await blowMention('error', '导出失败！')
    }

    setTimeout(() => {
      pluginWrapper.packaging = false
    }, 3200)

  } else return suc = false
})

function pack() {
  pluginWrapper.packaging = true

  pluginManager.exportPlugin(pluginWrapper.name, JSON.stringify(pluginWrapper.manifest), JSON.stringify(pluginWrapper.files))
}
</script>

<style lang="scss" scoped>
@keyframes waving {
  from {
    background-position: 200% 100%;
  }

  to {
    background-position: 0 100%;
  }
}

.Pack-Progressing {
  div {
    span {
      font-size: 12px;
    }

    position: relative;
    display: flex;
    flex-direction: row-reverse;

    top: -30px;

    justify-content: space-between;
  }

  &:before {
    content: "";
    position: absolute;

    top: 0;
    left: 0;

    width: var(--p, 0);
    height: 100%;

    transition: .25s linear;
    background-color: var(--el-color-primary-light-3);
  }

  &:after {
    content: "";
    position: absolute;

    top: 0;
    left: 0;

    //width: 100%;
    width: var(--p, 0);
    height: 100%;

    transition: .25s linear;
    background-image: linear-gradient(to right, var(--el-fill-color), var(--el-color-primary-dark-2), var(--el-fill-color));
    background-size: 200% 200%;

    animation: waving 1s linear infinite;
  }

  z-index: 1000;
  position: absolute;

  bottom: -5px;

  width: 100%;
  height: 5px;

  overflow: hidden;
  background-color: var(--el-fill-color-darker);
}

.Pack-Compressing {
  :deep(.LogTerminal-Container) {
    height: calc(100% - 30px);
  }

  position: relative;

  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  font-size: 25px;

  span {
    margin-top: 10px;
    font-size: 20px;

    color: var(--el-color-danger);
  }
}

.PluginWrapper-Wrapper {
  &.visible {
    opacity: 1;
    pointer-events: all;
    transform: translate(0, 0) scale(1);
  }

  .PluginWrapper-Referrer {
    &:hover {
      opacity: 1;

      height: 8px;
      width: 120px;
    }

    position: absolute;

    top: 5px;
    left: 50%;

    width: 50px;
    height: 5px;

    opacity: .75;
    cursor: pointer;
    border-radius: 5px;
    background-color: var(--el-color-info);

    transform: translate(-50%, 0);
    transition: .25s;
  }

  :deep(.pack-alert) {
    &:hover {
      opacity: .25;
    }

    z-index: 1;
    position: relative;

    bottom: 15px;

    background-color: var(--el-fill-color-darker);
  }

  z-index: 1000;
  position: absolute;
  padding-top: 15px;

  left: 0;
  top: 0;

  width: 100%;
  height: calc(100% - 10px);

  --fake-opacity: .75;

  opacity: 0;
  pointer-events: none;
  transform: translate(0, 100%) scale(.95);
  box-sizing: border-box;
  transition: .5s cubic-bezier(0.785, 0.135, 0.150, 0.860);
}

.PluginWrapper-Container {
  .Pack-Main {
    height: calc(100% - 35px);
  }

  position: relative;
  padding: 1% 2%;

  width: 100%;
  height: 100%;

  box-sizing: border-box;
}</style>
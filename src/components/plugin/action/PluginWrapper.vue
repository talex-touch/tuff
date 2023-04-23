<template>
 <div class="PluginWrapper-Wrapper fake-background" :class="{ visible: visible || pluginWrapper.packaging }">
   <span @click="visible = pluginWrapper.packaging || false" class="PluginWrapper-Referrer" />
   <div class="PluginWrapper-Container">
     <el-tabs v-if="!pluginWrapper.packaging" tab-position="right" v-model="tab">
       <el-tab-pane name="Manifest" label="基本信息">
         <FlatMarkdown v-model="plugin.readme" />
         <!--         <el-form>-->
         <!--            <el-form-item label="名称">-->
         <!--              <el-input v-model="pluginWrapper.manifest.name" />-->
         <!--            </el-form-item>-->
         <!--            <el-form-item label="版本">-->
         <!--              <el-input v-model="pluginWrapper.manifest.version" />-->
         <!--            </el-form-item>-->
         <!--            <el-form-item label="描述">-->
         <!--              <el-input v-model="pluginWrapper.manifest.description" />-->
         <!--            </el-form-item>-->
         <!--         </el-form>-->
       </el-tab-pane>
       <el-tab-pane name="PackFiles" label="打包文件">
         <FileTree v-model="pluginWrapper.files" :fileAdpoter="fileAdpoter" />

         <el-alert class="pack-alert" title="选择你要打包的文件" type="info" />
       </el-tab-pane>
       <el-tab-pane name="ReadyState" label="准备就绪">
         <FlatButton @click="pack" type="primary">打包</FlatButton>
       </el-tab-pane>
     </el-tabs>

     <div v-else class="Pack-Compressing">
       正在导出插件中，请耐心等待...
       <PluginExportMention />
       <teleport to=".PluginWrapper-Wrapper">
         <div class="Pack-Progressing" :style="`--p: ${pluginWrapper.p.p}%`">
           <span>
             {{ (pluginWrapper.p.p).toFixed(4) }} %
           </span>
         </div>
       </teleport>
       <LottieFrame :data="compressing" />
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
import { useModelWrapper } from "@modules/utils";
import { reactive, ref } from "vue";
import FileTree from "@comp/tree/FileTree.vue";
import FlatMarkdown from "@comp/input/FlatMarkdown.vue";
import FlatButton from "@comp/button/FlatButton.vue";
import { pluginManager, registerTypeProcess } from "@modules/samples/node-api";
import LottieFrame from "@comp/icon/lotties/LottieFrame.vue";
import compressing from "@assets/lotties/compress-loading.json"
import { blowMention } from "@modules/mention/dialog-mention";

const tab = ref("Manifest")
const props = defineProps(["plugin", "modelValue"])
const emit = defineEmits(["update:modelValue"])

const visible = useModelWrapper(props, emit)

const fileAdpoter = genFileAdpoter(pluginPath, props.plugin.pluginInfo.name)

const pluginWrapper = reactive({
  packaging: false,
  name: props.plugin.pluginInfo.name,
  manifest: props.plugin.pluginInfo,
  files: [ 'init.json', 'index.html' ],
  p: {
    n: 0,
    m: 0,
    p: 0
  }
})

registerTypeProcess('plugin-packager-progress/' + pluginWrapper.name, ({ data }) => {
  pluginWrapper.packaging = true
  pluginWrapper.p.m = data.total
  pluginWrapper.p.n = data.received

  const _p = (data.received / data.total * 100).toFixed(7)
  function calc(__p) {
    if ( __p > 99 ) {
      return calc((__p - 99) * 100)
    } else return __p
  }

  pluginWrapper.p.p = calc(_p)
})

registerTypeProcess('plugin-packager', ({ data }) => {
  if ( !pluginWrapper.packaging ) return
  if ( data.plugin === pluginWrapper.name ) {
    pluginWrapper.packaging = false

    if ( data.status === 'success' ) {
      blowMention('success', '导出成功！')
    } else {
      blowMention('error', '导出失败！')
    }
  }
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
  span {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -150%);
    color: var(--el-color-primary-dark-2);
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

  background-color: var(--el-fill-color-darker);
}

.Pack-Compressing {
  position: relative;
  padding-top: 5%;

  width: 100%;
  height: 90%;
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
    position: absolute;

    bottom: 0;

    background-color: var(--el-fill-color-darker);
  }
  z-index: 1000;
  position: absolute;
  padding-top: 15px;

  left: 0;
  top: 0;

  width: 100%;
  height: calc(100% - 15px);

  --fake-opacity: .75;

  opacity: 0;
  pointer-events: none;
  transform: translate(0, 100%) scale(.95);
  box-sizing: border-box;
  transition: .5s cubic-bezier(0.785, 0.135, 0.150, 0.860);
}

.PluginWrapper-Container {
  :deep(.el-tabs) {
    .el-tabs__content, .el-tab-pane {
      position: relative;
      height: 100%;
    }
    position: relative;
    height: 100%;
  }
  position: relative;
  padding: 1% 2%;

  width: 100%;
  height: 100%;

  box-sizing: border-box;
}
</style>
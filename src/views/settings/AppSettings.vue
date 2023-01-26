<template>
  <div class="AppSettings-Container">
    <div class="AboutApplication activate">
      <div class="About-Image">
        <div class="Home-Logo-Bg">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100px" height="100px">
            <polygon class="g-polygon-wrap" points="50 0, 100 25, 100 75, 50 100, 0 75,  0 25, 50 0" />
            <polygon class="g-polygon-move" points="50 0, 100 25, 100 75, 50 100, 0 75,  0 25, 50 0" />
          </svg>
        </div>

        <img src="@assets/TalexTouchChat-Small.png" alt="logo" />
      </div>

      <div class="About-Content">
        <div class="Home-Text">
          <svg>
            <text x="0" y="20%"> Talex-Touch </text>
          </svg>
          <span class="version" :class="{
            dev,
            'snapshot': packageJson.version.indexOf('snapshot') !== -1,
            'alpha': packageJson.version.indexOf('alpha') !== -1,
           }">{{ packageJson.version }}</span>

          <p>一款触手可及的全应用</p>
        </div>

        <ul class="About-Footer">
          <li>
            <remix-icon name="npmjs" />
            <span>{{ p.versions?.node }}</span>
          </li>
          <li>
            <remix-icon name="chrome" />
            <span>{{ p.versions?.chrome }}</span>
          </li>
          <li>
            <remix-icon name="vuejs" />
            <span>{{ String(packageJson.devDependencies?.vue).substring(1) }}</span>
          </li>
        </ul>
      </div>

    </div>

    <t-group-block name="账号" icon="account-box" description="在这里登录并管理你的touch账号">
      <t-block-switch title="暂无账号" icon="account-circle" disabled description="账号目前不可用" />
    </t-group-block>

    <t-group-block name="常规" icon="global" description="应用常规设置">
      <t-block-switch disabled v-model="options.autoStart" title="开机启动" icon="exchange" description="当电脑运行时自动启动软件" />
      <t-block-select disabled v-model="options.defaultApp" title="默认应用" icon="command" description="当运行相关软件时关联启动">
        <t-select-item>关闭</t-select-item>
        <t-select-item>全局</t-select-item>
        <t-select-item>跟随插件</t-select-item>
        <t-select-item>跟随配置</t-select-item>
      </t-block-select>

    </t-group-block>

    <t-group-block name="语言" icon="earth" description="应用语言设置">
      <t-block-switch v-model="options.lang.followSystem" title="跟随系统" icon="exchange" description="语言自动跟随系统切换" />
      <t-block-select :disabled="options.lang?.followSystem" v-model="options.lang.locale" title="选择语言" icon="goblet" description="当前应用语言">
        <t-select-item>简体中文</t-select-item>
        <t-select-item disabled>繁体中文</t-select-item>
        <t-select-item disabled>English</t-select-item>
        <t-select-item disabled>日本語</t-select-item>
      </t-block-select>

    </t-group-block>

    <t-group-block name="开发" icon="code-s-slash" description="开发状态时相应的设置">
      <t-block-switch v-model="options.dev.autoCloseDev" title="跟随关闭" icon="exchange" description="插件窗口取消激活时随带关闭调试工具" />

    </t-group-block>

    <t-group-block name="热键" icon="keyboard" description="所有注册的按键绑定功能设置">
      <t-block-select v-model="options.keyBind.summon" title="召唤窗口" icon="space-ship" description="召唤应用主窗口" >
        <t-select-item>Ctrl + Space</t-select-item>
        <t-select-item disabled>自定义</t-select-item>
      </t-block-select>

      <t-block-select v-model="options.keyBind.home" title="切换为主页" icon="home-3" description="如果窗口未激活将自动激活" >
        <t-select-item>Alt + Home</t-select-item>
        <t-select-item disabled>自定义</t-select-item>
      </t-block-select>

      <t-block-select v-model="options.keyBind.plugins" title="切换为插件" icon="plug-2" description="如果窗口未激活将自动激活" >
        <t-select-item>Alt + P</t-select-item>
        <t-select-item disabled>自定义</t-select-item>
      </t-block-select>

      <t-block-select v-model="options.keyBind.settings" title="切换为设置" icon="settings-6" description="如果窗口未激活将自动激活" >
        <t-select-item>Alt + S</t-select-item>
        <t-select-item disabled>自定义</t-select-item>
      </t-block-select>
    </t-group-block>

    <t-group-block name="共享" icon="share-box" description="跨设备数据共享">
      <t-group-block :shrink="true"  name="插件同步" icon="plug-2" description="插件跨设备同步">
        <t-block-select v-model="options.plugin.sync" title="插件同步" icon="plug-2" description="同步插件数据">
          <t-select-item>永不同步</t-select-item>
          <t-select-item>黑名单模式</t-select-item>
          <t-select-item>白名单模式</t-select-item>
        </t-block-select>
        <t-block-switch title="保持最新" icon="refresh" v-model="options.plugin.syncLatest" description="保持各个设备插件均为最新" />
        <t-block-switch title="数据同步" icon="refresh" v-model="options.plugin.dataSync" description="若相关插件未适配，不同设备间数据可能会冲突" />
      </t-group-block>
      <t-group-block :shrink="true" name="剪贴板同步" icon="clipboard" description="剪贴板跨设备同步">
        <t-block-select v-model="options.plugin.sync" title="剪贴板同步" icon="clipboard" description="同步剪贴板数据">
          <t-select-item>永不同步</t-select-item>
          <t-select-item>黑名单模式</t-select-item>
          <t-select-item>白名单模式</t-select-item>
        </t-block-select>
        <t-block-switch title="自动转换" icon="refresh" v-model="options.plugin.syncLatest" description="自动转换剪贴板数据以适配不同设备" />
      </t-group-block>
      
      <t-block-switch title="隐私" icon="shield" guidance description="获取数据保护和隐私保护的有关信息" />

    </t-group-block>

    <t-group-block name="应用规格 (Touch)" icon="apps">
      <t-block-line title="版本" :description="versionStr"></t-block-line>
      <t-block-line title="规格" description="23H1"></t-block-line>
      <t-block-line title="Electron" :description="p.versions?.electron"></t-block-line>
      <t-block-line title="V8-Engine" :description="p.versions?.v8"></t-block-line>
      <t-block-line title="操作系统" :description="os.version()"></t-block-line>
      <t-block-line title="操作平台" :description="`${p.platform} (${os.arch()})`"></t-block-line>
      <t-block-line title="体验" description="Touch Feature Experience Pack 2023.01.26"></t-block-line>
      <t-block-line title="TalexTouch 服务协议" :link="true"></t-block-line>
      <t-block-line title="TalexTouch 软件许可条款" :link="true"></t-block-line>

    </t-group-block>
  </div>
</template>

<script>
import TGroupBlock from '@comp/group/TGroupBlock.vue'
import TBlockSwitch from '@comp/switch/TBlockSwitch.vue'
import TBlockSelect from '@comp/select/TBlockSelect.vue'
import TSelectItem from '@comp/select/TSelectItem.vue'

export default {
  name: "AppSettings",
  components: { TSelectItem, TBlockSelect, TBlockSwitch, TGroupBlock }
}
</script>

<script setup>
import { computed, onMounted, ref } from 'vue'
import os from 'os'

const p = ref({})
const dev = ref(false)

const packageJson = window.$nodeApi.getPackageJSON()

const options = window.$storage.appSetting

const versionStr = computed(() => `TalexTouch ${dev.value ? '开发版' : '正式版'} ${packageJson.version}`)

onMounted(() => {
  p.value = process
  dev.value = process.env.NODE_ENV === 'development'
  // console.log( process.env.NODE_ENV === 'development' )
})
</script>

<style lang="scss" scoped>
.AboutApplication {
  .About-Content {
    .About-Footer {
      position: absolute;
      padding: 0;
      display: flex;

      left: -1%;

      width: 90%;
      bottom: 0;
      li {
        :deep(.remix) {
          position: relative;
          margin-left: -5px;
          margin-right: 5px;
          padding: 2px;
          top: .15em;

          border-radius: 50%;
          background-color: var(--el-fill-color-darker);
        }
        position: relative;
        //margin-right: 5px;
        padding: 4px 12px;

        border-radius: 8px;
        list-style: none;

        opacity: .85;
        transform: scale(.85);
        background-color: var(--el-fill-color-light);
      }
    }
    position: absolute;

    left: 5%;
    top: 15%;

    width: 70%;
    height: 70%;

    .Home-Text {
      p {
        opacity: .75;
        color: var(--el-fill-color-light)
      }
      & .version {
        &.alpha {
          background-color: var(--el-color-info-light-5);
        }
        &.snapshot {
          background-color: var(--el-color-warning-light-5);
        }
        &.dev {
          background-color: var(--el-color-error-light-5);
        }
        position: absolute;
        margin: 6px 0;
        padding: 2px 8px;

        left: 42%;
        height: 30px;
        line-height: 26px;

        font-size: 14px;
        border-radius: 4px;
        box-sizing: border-box;
        opacity: .85;
        transform: scale(.8);
        background-color: var(--el-color-primary-light-5);
      }

      p {
        position: absolute;
        margin: 0;

        top: 40px;
      }

      svg text {
        //display: flex;
        //align-items: center;

        text-transform: uppercase;
        animation: stroke 2.5s alternate forwards;
        letter-spacing: 5px;
        font-size: 22px;
      }
      @keyframes stroke {
        0% {
          fill: rgba(72, 138, 20, 0);
          stroke: rgba(54, 95, 160, 1);
          stroke-dashoffset: 25%;
          stroke-dasharray: 0 50%;
          stroke-width: 0.2;
        }
        50% {
          fill: rgba(72, 138, 20, 0);
          stroke: rgba(54, 95, 160, 1);
          stroke-width: 0.5;
        }
        70% {
          fill: rgba(72, 138, 20, 0);
          stroke: rgba(54, 95, 160, 1);
          stroke-width: 1;
        }
        90%,
        100% {
          fill: var(--el-fill-color-light);
          stroke: rgba(54, 95, 160, 0);
          stroke-dashoffset: -25%;
          stroke-dasharray: 50% 0;
          stroke-width: 0;
        }
      }

    }

  }
  .About-Image {
    .Home-Logo-Bg {
      svg {
        overflow: visible;
        transform: scalex(.85);
      }

      .g-polygon-wrap,
      .g-polygon-move {
        fill: none;
        stroke: var(--el-color-primary);
        stroke-width: 2;
        stroke-linejoin: round;
        stroke-linecap: round;
      }

      .g-polygon-move {
        transform-origin: center center;
        transform: scale(1.05);
        //stroke: linear-gradinet(180deg, red, transprent);
        stroke-width: 1.5;
        stroke-dasharray: 280, 700;
        stroke-dashoffset: 8;
        animation: move 2.4s infinite linear;
      }

      @keyframes move {
        0% {
          stroke-dashoffset: 8;
        }
        100% {
          stroke-dashoffset: -972;
        }
      }
    }
    position: absolute;
    display: flex;

    align-items: center;

    top: 20%;
    right: 5%;

    height: 60%;

    img {
      position: absolute;

      top: -2px;
      left: -4px;

      height: 100%;

      transform: scale(.85)
    }
  }

  &.activate {
    &:before {
      opacity: 0;
    }
    opacity: .75;
    background-image: linear-gradient(to right, var(--el-color-primary-light-3) 0%, var(--el-color-primary-dark-2) 50%, var(--el-color-primary-light-3) 100%);
  }
  &:before {
    content: "未激活";
    position: absolute;
    display: flex;

    align-items: center;
    justify-content: center;

    left: 0;
    top: 0;

    width: 100%;
    height: 100%;

    opacity: .5;
    font-size: 20px;
    font-weight: 600;
    border-radius: 4px;
    background-color: var(--el-fill-color-darker);
  }
  position: relative;
  margin-bottom: 15px;

  width: 100%;
  min-height: 180px;
  height: 30%;

  clear: both;
  opacity: .45;
  border-radius: 4px;
  background-color: var(--el-fill-color-light);
  background-image: linear-gradient(to right, var(--el-color-primary-light-3) 0%, var(--el-color-info-dark-2) 50%, var(--el-color-primary-light-3) 100%);
  background-size: 200% 100%;
  filter: drop-shadow(0 0 4px var(--el-color-primary-light-7));

  animation: waving 10s infinite linear;
}

@keyframes waving {
  from {
    background-position: 0;
  }
  to {
    background-position: 200%;
  }
}

.AppSettings-Container {
  position: relative;

  height: 100%;
  width: 100%;

}
</style>
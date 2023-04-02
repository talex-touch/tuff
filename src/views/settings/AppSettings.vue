<template>
  <div class="AppSettings-Container">
    <div class="AboutApplication activate">
      <div class="About-Image">
        <div class="Home-Logo-Bg">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100px" height="100px">
            <circle class="g-polygon-move" cx="50" cy="50" r="50" />
          </svg>
        </div>

        <img src="@assets/logo.svg" alt="logo" />
      </div>

      <div class="About-Content">
        <div class="Home-Text">
          <svg>
            <text x="0" y="20%"> Talex-Touch </text>
          </svg>
          <span class="version" v-if="$env.packageJson" :class="{
            dev,
            'snapshot': $env.packageJson.version.indexOf('snapshot') !== -1,
            'alpha': $env.packageJson.version.indexOf('alpha') !== -1,
           }">{{ $env.packageJson.version }}</span>

          <p>{{ $t('app.description') }}</p>
        </div>

        <ul class="About-Footer" v-if="$env.process">
          <li>
            <remix-icon name="npmjs" />
            <span>{{ $env.process.versions?.node }}</span>
          </li>
          <li>
            <remix-icon name="chrome" />
            <span>{{ $env.process.versions?.chrome }}</span>
          </li>
          <li>
            <remix-icon name="vuejs" />
            <span>{{ String($env.packageJson?.devDependencies?.vue).substring(1) }}</span>
          </li>
        </ul>
      </div>

    </div>

    <t-group-block :name="$t('base.account')" icon="account-box" :description="$t('settings.application.list-settings.account.description')">
      <t-block-slot v-if="$env.account?.user" :title="$env.account?.user.username" icon="account-circle" disabled :description="$env.account?.user.email">
        <FlatButton>
          {{ $t('base.logout') }}
        </FlatButton>
      </t-block-slot>
      <t-block-slot v-else :title="$t('base.none-account')" icon="account-circle" disabled :description="$t('settings.application.list-settings.account.unavailable')">
        <FlatButton @click="login">
          {{ $t('base.login') }}
        </FlatButton>
      </t-block-slot>
      <!--      <t-block-switch :title="$t('base.none-account')" icon="account-circle" disabled :description="$t('settings.application.list-settings.account.unavailable')" />-->
    </t-group-block>

    <t-group-block :name="$t('settings.application.list-settings.conventional.name')" icon="global" :description="$t('settings.application.list-settings.conventional.description')">
      <t-block-switch disabled v-model="options.autoStart" :title="$t('settings.application.list-settings.conventional.open-on-start.name')" icon="exchange" :description="$t('settings.application.list-settings.conventional.open-on-start.description')" />
      <t-block-select disabled v-model="options.defaultApp" :title="$t('settings.application.list-settings.conventional.default-app.name')" icon="command" :description="$t('settings.application.list-settings.conventional.default-app.description')">
        <t-select-item>{{ $t('base.close') }}</t-select-item>
        <t-select-item>{{ $t('base.global') }}</t-select-item>
        <t-select-item>跟随插件</t-select-item>
        <t-select-item>跟随配置</t-select-item>
      </t-block-select>

    </t-group-block>

    <t-group-block :name="$t('settings.application.list-settings.language.name')" icon="earth" :description="$t('settings.application.list-settings.language.description')">
      <t-block-switch v-model="options.lang.followSystem" :title="$t('settings.application.list-settings.language.system')" icon="exchange" :description="$t('settings.application.list-settings.language.description')" />
      <t-block-select :disabled="options.lang?.followSystem" v-model="options.lang.locale" :title="$t('settings.application.list-settings.language.select.name')" icon="goblet" :description="$t('settings.application.list-settings.language.select.description')">
        <t-select-item v-for="lang in languages">{{ lang.name }}</t-select-item>
      </t-block-select>

    </t-group-block>

    <t-group-block :name="$t('settings.application.list-settings.develop.name')" icon="code-s-slash" :description="$t('settings.application.list-settings.develop.description')">
      <t-block-switch v-model="options.dev.autoCloseDev" :title="$t('settings.application.list-settings.develop.auto.name')" icon="exchange" :description="$t('settings.application.list-settings.develop.auto.description')" />

    </t-group-block>

    <t-group-block :name="$t('settings.application.list-settings.hot-key.name')" icon="keyboard" :description="$t('settings.application.list-settings.hot-key.description')">
      <t-block-select v-model="options.keyBind.summon" :title="$t('settings.application.list-settings.hot-key.spawn-window.name')" icon="space-ship" :description="$t('settings.application.list-settings.hot-key.spawn-window.description')" >
        <t-select-item>Ctrl + Space</t-select-item>
        <t-select-item disabled>自定义</t-select-item>
      </t-block-select>

      <t-block-select v-model="options.keyBind.home" :title="$t('settings.application.list-settings.hot-key.change-index.name')" icon="home-3" :description="$t('settings.application.list-settings.hot-key.change-index.description')" >
        <t-select-item>Alt + Home</t-select-item>
        <t-select-item disabled>自定义</t-select-item>
      </t-block-select>

      <t-block-select v-model="options.keyBind.plugins" :title="$t('settings.application.list-settings.hot-key.change-plugins.name')" icon="plug-2" :description="$t('settings.application.list-settings.hot-key.change-plugins.description')" >
        <t-select-item>Alt + P</t-select-item>
        <t-select-item disabled>自定义</t-select-item>
      </t-block-select>

      <t-block-select v-model="options.keyBind.settings" :title="$t('settings.application.list-settings.hot-key.change-settings.name')" icon="settings-6" :description="$t('settings.application.list-settings.hot-key.change-settings.description')" >
        <t-select-item>Alt + S</t-select-item>
        <t-select-item disabled>自定义</t-select-item>
      </t-block-select>
    </t-group-block>

    <t-group-block :name="`${$t('settings.application.list-settings.specifications.name')} (Touch)`" icon="apps">
      <t-block-line :title="$t('settings.application.list-settings.specifications.version')" :description="versionStr"></t-block-line>
      <t-block-line :title="$t('settings.application.list-settings.specifications.specifications')" description="23H4 T1"></t-block-line>
      <t-block-line :title="$t('settings.application.list-settings.specifications.time')">
        <template #description>
          {{ startCosts }}s
          <span class="tag" style="color: var(--el-color-success)" v-if="startCosts < 0.1">
            完美
          </span>
          <span class="tag" style="color: var(--el-color-warning)" v-else-if="startCosts < 0.5">
            启动较慢
          </span>
          <span class="tag" style="color: var(--el-color-error)" v-else-if="startCosts < 1">
            启动缓慢
          </span>
          <span class="tag" style="color: var(--el-color-error); font-weight: 600" v-else-if="startCosts < 10">
            启动滞后
          </span>
          <span class="tag" style="color: var(--el-color-error); font-weight: 600" v-else>
            启动极慢
          </span>
        </template>
      </t-block-line>
      <t-block-line title="Electron" :description="$env.process.versions?.electron"></t-block-line>
      <t-block-line title="V8-Engine" :description="$env.process.versions?.v8"></t-block-line>
      <t-block-line :title="$t('settings.application.list-settings.specifications.os')" :description="$env.os.version"></t-block-line>
      <t-block-line :title="$t('settings.application.list-settings.specifications.platform')" :description="`${$env.process.platform} (${$env.os.arch})`"></t-block-line>
      <t-block-line :title="$t('settings.application.list-settings.specifications.experience')" description="Touch Feature Experience Pack 2023.03.19"></t-block-line>
      <t-block-line :title="$t('settings.application.list-settings.specifications.cpu-usage')">
        <template #description>
          <span :data-text="`${Math.round(cpuUsage[0].value.percentCPUUsage * 10000) / 100}%`" class="Usage" :style="`--color: var(--el-color-danger);--percent: ${cpuUsage[0].value.percentCPUUsage * 100}%`">
          </span>
        </template>
      </t-block-line>
      <!--      <t-block-line :title="$t('settings.application.list-settings.specifications.gpu-usage')" description="Touch Feature Experience Pack 2023.02.21"></t-block-line>-->
      <t-block-line :title="$t('settings.application.list-settings.specifications.memory-usage')">
        <template #description>
          <span :data-text="`${Math.round((memoryUsage[0].value.heapUsed / memoryUsage[0].value.heapTotal) * 10000) / 100}%`" class="Usage" :style="`--color: var(--el-color-primary);--percent: ${(memoryUsage[0].value.heapUsed / memoryUsage[0].value.heapTotal) * 100}%`">
          </span>
        </template>
      </t-block-line>
      <t-block-line :title="`TalexTouch ${$t('protocol.service')}`" :link="true"></t-block-line>
      <t-block-line :title="`TalexTouch ${$t('protocol.software')}`" :link="true"></t-block-line>
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
import { computed, onBeforeUnmount, onMounted, ref, reactive } from 'vue'
import { $t, languages } from '@modules/lang'
import TBlockLine from '@comp/group/TBlockLine.vue'
import { useCPUUsage, useMemoryUsage, useOS } from '@modules/hooks/os-hooks'
import RemixIcon from '@comp/icon/RemixIcon.vue'
import TBlockSlot from "@comp/group/TBlockSlot.vue";
import FlatButton from "@comp/button/FlatButton.vue";
import { useLogin } from "@modules/hooks/function-hooks";

const $env = reactive({
  os: null,
  process: null,
  packageJson: null,
  account: window.$storage.account
})

const dev = ref(false)

const options = window.$storage.appSetting

const versionStr = computed(() => `TalexTouch ${dev.value ? $t('version.dev') : 'version.official'} ${$env.packageJson?.version}`)
const startCosts = ref('')

const cpuUsage = useCPUUsage()
const memoryUsage = useMemoryUsage()

onBeforeUnmount(() => {
  cpuUsage[1]()
  memoryUsage[1]()
})

// initially
!(async () => {
  const res = await Promise.all([
    Promise.resolve(  dev.value = process.env.NODE_ENV === 'development' ),
    Promise.resolve( $env.os = useOS() ),
    Promise.resolve( $env.process = process ),
    Promise.resolve( $env.packageJson = window.$nodeApi.getPackageJSON() ),
    Promise.resolve( startCosts.value = (window['_doneTimeDiff'] ?? 0) / 1000 )
  ])

  console.log( res )
})()

function login() {
  useLogin()
}
</script>

<style lang="scss" scoped>
.Usage {
  &:before {
    content: "";
    position: absolute;

    left: 0;
    top: 0;

    width: var(--percent, 100%);
    max-width: 100%;
    height: 100%;

    background-color: var(--color, var(--el-color-info));
    border-radius: 2px;
    transition: 1s linear;
  }
  &:after {
    content: attr(data-text);
    position: absolute;

    left: 80%;
  }
  position: relative;
  display: inline-block;

  //margin-left: 32px;

  width: 120px;
  height: 20px;

  border-radius: 4px;
  border: 1px solid var(--el-border-color);
}

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
      }

      .g-polygon-wrap,
      .g-polygon-move {
        fill: none;
        stroke: var(--el-color-primary-dark-2);
        stroke-width: 2;
        stroke-linejoin: round;
        stroke-linecap: round;
      }

      .g-polygon-move {
        transform-origin: center center;
        //transform: scale(1.05);
        //stroke: linear-gradinet(180deg, red, transprent);
        stroke-width: 2;
        stroke-dasharray: 280, 700;
        stroke-dashoffset: 10;
        animation: move .1s infinite linear;
      }

      @keyframes move {
        0% {
          stroke-dashoffset: 0;
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
<script setup lang="ts">
import * as Sentry from '@sentry/vue'
import { $endApi } from '~/composables/api/base'
import { globalOptions } from '~/constants'

const online = useOnline()
const status = ref(true)
const router: any = useRouter()
// const powerMode = ref(false)

// 检测后端接口 如果无法使用则直接提示
async function detectEndStatus() {
  if (!online.value)
    return status.value = false

  // 为了避免每次弹窗打扰用户使用
  status.value = true

  const res = await $endApi.v1.common.status()

  status.value = res?.data?.message === 'OK'

  // if (localStorage.getItem('powered-by') !== 'initial') {
  //   status.value = powerMode.value = true

  //   setTimeout(() => {
  //     status.value = powerMode.value = false
  //     localStorage.setItem('powered-by', 'initial')
  //   }, 3000)
  // }
}

let lastSave = ''

function saveConfig() {
  if (!userStore.value.isLogin)
    return

  const text = JSON.stringify({
    pri_info: userConfig.value.pri_info,
    pub_info: userConfig.value.pub_info,
  })

  if (text !== lastSave) {
    lastSave = text
    saveUserConfig()

    console.log('save user config')
  }
}

onMounted(() => {
  if (!import.meta.env.DEV) {
    Sentry.init({
      app: getCurrentInstance()!.appContext.app,
      dsn: 'https://6e718ca36ad94840c7b0539a57144a67@o4508024637620224.ingest.us.sentry.io/4508024640438272',
      integrations: [
        Sentry.browserTracingIntegration({ router }),
        Sentry.replayIntegration(),
      ],
      // Tracing
      tracesSampleRate: 1.0, //  Capture 100% of the transactions
      // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
      tracePropagationTargets: ['localhost', /^https:\/\/yourserver\.io\/api/],
      // Session Replay
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    })

    // eslint-disable-next-line no-console
    console.log('Monitor Injected!')
  }

  detectEndStatus()

  /* const { pause, resume, isActive } =  */useIntervalFn(saveConfig, 45000)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden')
      saveConfig()
  })
})
watch(() => online.value, detectEndStatus)
</script>

<template>
  <div class="GlobeStatus" :class="{ display: status }">
    <div v-for="i in 4" :key="i" :class="`item-${i}`" class="item" />

    <div class="Mentions">
      <div class="Tip">
        <!-- <span v-if="powerMode">
          科塔智爱 | ThisAI
        </span> -->
        <span v-if="online">系统服务器正在维护中，请关注官方QQ群了解更多：635268678</span>
        <span v-else>请连接至互联网后使用</span>
      </div>

      <!-- <div class="powered-by">
        <p>由 ChatGPT和豆包 联合驱动</p>

        <div class="brands">
          <ChorePoweredByOpenAI />
          <ChorePoweredByDouBao />
        </div>
      </div> -->
    </div>
  </div>
</template>

<style lang="scss" scoped>
.GlobeStatus {
  .powered-by {
    p {
      color: var(--el-text-color-primary);
      font-weight: 600;
    }
    .brands {
      display: flex;

      gap: 0.5rem;
    }
    position: absolute;
    display: flex;

    gap: 1rem;
    align-items: center;
    justify-content: center;
    flex-direction: column;

    bottom: 5%;
  }

  .Mentions {
    z-index: 100;
    position: absolute;
    display: flex;

    top: 50%;
    left: 50%;

    width: 100%;
    height: 100%;

    text-align: center;
    align-items: center;
    justify-content: center;

    font-size: 24px;
    font-weight: 600;
    color: var(--el-color-danger);
    transition: 0.25s;
    transform: translate(-50%, -50%) scale(1);
    .Tip {
      animation: q_shining 1s infinite linear;
    }
  }

  &.display {
    .Mentions {
      transform: translate(-50%, -50%) scale(0);
    }

    .item-1 {
      right: -100%;
      bottom: -100%;
    }

    .item-2 {
      top: -100%;
      right: -100%;
    }

    .item-3 {
      left: -100%;
      bottom: -100%;
    }

    .item-4 {
      top: -100%;
      left: -100%;
    }

    pointer-events: none;
    backdrop-filter: blur(0);
  }

  .item-1 {
    right: 0;
    bottom: 0;
  }

  .item-2 {
    top: 0;
    right: 0;
  }

  .item-3 {
    left: 0;
    bottom: 0;
  }

  .item-4 {
    top: 0;
    left: 0;
  }

  .item {
    position: absolute;

    width: 50%;
    height: 50%;

    opacity: 0.75;
    background-color: var(--el-bg-color-overlay);
    transition: 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);
  }

  z-index: 100000;
  position: absolute;

  top: 0;
  left: 0;

  width: 100%;
  height: 100%;

  // color: var(--el-color-danger);
  backdrop-filter: blur(18px);
  transition: 0.75s cubic-bezier(0.785, 0.135, 0.15, 0.86);
}
</style>

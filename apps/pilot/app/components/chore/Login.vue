<script setup lang="ts">
import LoadingIcon from '../icon/LoadingIcon.vue'
import LoginCore from './login/LoginCore.vue'
import { Platform, getQrCodeStatus, postQrCodeReq, qrCodeLogin, sendSMSCode, useSMSLogin } from '~/composables/api/auth'
import ThCheckBox from '~/components/checkbox/ThCheckBox.vue'
import { $handleUserLogin } from '~/composables/user'
import { createTapTip, forWikiDialogTip } from '~/composables/tip'

const props = defineProps<{
  show: boolean
}>()

const emits = defineEmits<{
  (e: 'modelValue:show'): void
}>()

const codeStatus = ref(0)
let startTime = Date.now()

function formatter(value: string) {
  // 移除所有非数字字符
  const cleaned = value.replace(/\D/g, '')

  // 判断手机号长度
  if (cleaned.length >= 8) {
    const part1 = cleaned.slice(0, 3)
    const part2 = cleaned.slice(3, 7)
    const part3 = cleaned.slice(7, 11)
    return `${part1} ${part2} ${part3}`
  }
  else if (cleaned.length >= 4 && cleaned.length < 8) {
    const part1 = cleaned.slice(0, 3)
    const part2 = cleaned.slice(3)
    return `${part1} ${part2}`
  }
  else if (cleaned.length < 4) {
    return cleaned
  }
  else {
    // 如果长度不符合手机号码规则，返回原始值
    return value
  }
}

function parser(input: string) {
  // 去除前后空格并保留原始格式
  let trimmedInput = input.trim()

  // 确保输入只包含数字和空格
  if (!/^\d+( \d+)*$/.test(trimmedInput))
    return input // 返回原始输入

  // 去除多余的空格
  trimmedInput = trimmedInput.replace(/\s+/g, ' ').trim()

  // 处理不同情况
  const match = trimmedInput.match(/^(1\d{0,10})$/)
  if (match) {
    if (match[1].length <= 3)
      return match[1]
    else if (match[1].length <= 7)
      return `${match[1].slice(0, 3)} ${match[1].slice(3)}`
    else
      return `${match[1].slice(0, 3)} ${match[1].slice(3, 7)} ${match[1].slice(7)}`
  }

  return input // 返回原始输入
}

const show = useVModel(props, 'show', emits)
const codeData = useLocalStorage('code-data', {
  active: 'phone',
  expired: true,
  loading: false,
  lastFetch: -1,
  data: {},
})
const data = reactive({
  account: '',
  code: '',
  agreement: true,
  user: '',
  pass: '',
})

const smsOptions = reactive({
  lastSent: -1,
  loading: false,
  title: '发送验证码',
  disabled: false,
  smsLogin: false,
})

async function handleSendCode() {
  const tapTip = createTapTip('正在发送短信验证码')

  tapTip.setLoading(true).setType(TipType.INFO)
  tapTip.show()

  await sleep(600)

  if (!data.agreement) {
    tapTip.setLoading(false).setMessage('请先同意协议！').setType(TipType.WARNING)
    return
  }

  const phone = data.account.replaceAll(' ', '')
  if (phone.length !== 11) {
    tapTip.setLoading(false).setMessage('请输入正确的手机号！').setType(TipType.WARNING)
    return
  }

  if (smsOptions.disabled)
    return

  smsOptions.loading = true

  try {
    const res = await sendSMSCode(data.account.replaceAll(' ', ''))

    if (res.message === 'sms-sent-err') {
      tapTip.setLoading(false).setMessage('无法向目标手机号发送消息').setType(TipType.ERROR)
    }
    else if (res.code === 200) {
      smsOptions.lastSent = Date.now()

      refreshSmsTitle()

      tapTip.setLoading(false).setMessage('验证码发送成功!').setType(TipType.SUCCESS)
    }
  }
  catch (e: any) {
    console.error(e)

    tapTip.setLoading(false).setMessage(`发送失败(${e.message || 'error'})！`).setType(TipType.ERROR)
  }

  smsOptions.loading = false
}

async function handleLogin() {
  const tapTip = createTapTip('正在准备登录')

  tapTip.setLoading(true).setType(TipType.INFO)
  tapTip.show()

  await sleep(600)

  if (!data.agreement) {
    tapTip.setLoading(false).setMessage('请先同意协议！').setType(TipType.WARNING)
    return
  }

  const phone = data.account.replaceAll(' ', '')
  if (phone.length !== 11) {
    tapTip.setLoading(false).setMessage('请输入正确的手机号！').setType(TipType.WARNING)
    return
  }

  if (+data.code < 100000 || +data.code > 999999) {
    tapTip.setLoading(false).setMessage('请输入正确的验证码！').setType(TipType.WARNING)
    return
  }

  // Internal Test
  // const res = await doAccountExist(phone)
  // if (!res.data) {
  //   ElMessage.error('请先通过内测资格后再登录使用！')
  //   return
  // }

  // const button = document.getElementById('captcha-button')
  // button?.click()

  try {
    smsOptions.smsLogin = true
    const state = (codeStatus.value !== 4 || codeData.value.expired) ? undefined : (codeData.value.data as any)?.loginCode

    const res = await useSMSLogin(data.account.replaceAll(' ', ''), data.code, '', state)

    if (res.code === 1003) {
      tapTip.setLoading(false).setMessage('短信验证码有误！').setType(TipType.ERROR)
    }
    else if (res.code === 200) {
      if (!res.data) {
        tapTip.setLoading(false).setMessage(res.message).setType(TipType.ERROR)
        smsOptions.smsLogin = false
      }
      else {
        localStorage.removeItem('code-data')

        $handleUserLogin(res.data)

        tapTip.setLoading(false).setMessage('登录成功！').setType(TipType.SUCCESS)

        setTimeout(() => {
          show.value = false
        }, 1200)
      }
    }

    console.error(res)
  }
  catch (e: any) {
    console.error(e)

    tapTip.setLoading(false).setMessage(`发送失败(${e.message || 'error'})！`).setType(TipType.ERROR)
  }
}

function refreshSmsTitle() {
  const diff = Date.now() - smsOptions.lastSent
  if (diff > 60000) {
    smsOptions.title = '发送验证码'
    smsOptions.disabled = false
  }
  else {
    smsOptions.disabled = true
    smsOptions.title = `${(60 - Math.floor(diff / 1000)).toString().padStart(2, '0')}s后重发`
    setTimeout(refreshSmsTitle, 1000)
  }
}

watch(() => show.value, (val) => {
  if (val)
    startTime = Date.now()
})

onMounted(async () => {
  if (document.body.classList.contains('mobile'))
    return

  if (!codeData.value.active)
    codeData.value.active = 'phone'

  await fetchCode()

  codeStatusTimer()
})

async function fetchCode() {
  codeData.value.loading = true

  let { lastFetch, data: _data, expired } = codeData.value

  if (Date.now() - lastFetch >= 280000 || expired) {
    codeData.value.lastFetch = Date.now()

    const res: any = await postQrCodeReq(Platform.WECHAT)

    if (res.code === 200) {
      codeData.value.data = _data = res.data
      codeData.value.expired = false
    }
  }

  codeData.value.loading = false
}

async function codeStatusTimer() {
  if (userStore.value.isLogin)
    return

  // 如果超过2分钟用户啥也没做就不要她登陆了 免得一直ddos后台
  if (Date.now() - startTime >= 120000)
    show.value = false

  if (props.show && !document.body.classList.contains('mobile'))
    await _codeStatusTimer()

  setTimeout(codeStatusTimer, 2000)
}

async function _codeStatusTimer() {
  const _codeData: any = codeData.value.data
  if (!_codeData || !_codeData.loginCode)
    return await fetchCode()

  if (codeData.value.expired)
    return

  const { lastFetch, data: _data } = codeData.value
  const res = await getQrCodeStatus(Platform.WECHAT, _codeData.loginCode)
  if (res.data === null || Date.now() - lastFetch >= 280000) {
    codeData.value.expired = true
    codeStatus.value = 0
    return
  }

  codeStatus.value = res.data
}

watch(() => codeStatus.value, async (status) => {
  if (status !== 3)
    return

  // 用户已经用短信验证码登录了就不要处理这个请求了 防止二次无效登录
  if (smsOptions.smsLogin)
    return

  const _codeData: any = codeData.value.data

  const res: any = await qrCodeLogin(_codeData.loginCode)

  localStorage.removeItem('code-data')

  if (res.code !== 200) {
    ElMessage({
      message: `登录失败(${res.message || 'error'})！`,
      grouping: true,
      type: 'error',
      plain: true,
    })
    return
  }

  setTimeout(async () => {
    await $handleUserLogin(res.data)
    // userStore.value.token = (res.data.token)

    ElMessage({
      message: `已成功登录！`,
      grouping: true,
      type: 'success',
      plain: true,
    })

    show.value = false
  }, 800)
})

function handleAccountLogin() {
  // forWikiTip('正在登录，请稍后...', 2600, TipType.INFO, true)

  forWikiDialogTip('Hi', 'there')
}

// @ts-expect-error force exist
const codeUrl = computed(() => `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${codeData.value.data?.ticket}`)
</script>

<template>
  <div :class="{ show }" class="Login" @click="show = false">
    <div class="Login-Container" @click.stop="show = true">
      <div class="Login-Head">
        <h1 font-bold>
          <p>登录后</p>
          尽情和<span class="name">ThisAI</span>畅聊
        </h1>

        <LoginCore />
      </div>

      <div class="Login-Main">
        <div :class="{ bind: codeStatus === 4 }" class="Login-Main-Major">
          <el-tabs v-model="codeData.active">
            <el-tab-pane name="phone" label="手机号登录">
              <br>

              <el-form>
                <el-input v-model="data.account" maxlength="13" :parser="parser" :formatter="formatter" size="large">
                  <template #prepend>
                    +86
                  </template>
                </el-input>
                <el-input v-model="data.code" maxlength="6" size="large">
                  <template #append>
                    <el-button
                      v-wave :loading="smsOptions.loading"
                      :disabled="smsOptions.disabled || data.account.length !== 13" @click="handleSendCode"
                    >
                      {{ smsOptions.title }}
                    </el-button>
                  </template>
                </el-input>
                <el-button v-wave size="large" type="primary" :disabled="data.code.length !== 6" @click="handleLogin">
                  登 录
                </el-button>
              </el-form>
            </el-tab-pane>
            <el-tab-pane name="account" label="账号密码登录">
              <br>

              <el-form>
                <el-input v-model="data.user" size="large">
                  <template #prepend>
                    账号
                  </template>
                </el-input>
                <el-input v-model="data.pass" type="password" size="large">
                  <template #prepend>
                    密码
                  </template>
                </el-input>
                <el-button
                  v-wave :disabled="!data.user || !data.pass" size="large" type="primary"
                  @click="handleAccountLogin"
                >
                  登 录
                </el-button>
              </el-form>
            </el-tab-pane>
          </el-tabs>
          <!-- <p>手机登录</p> -->

          <div id="captcha-element" absolute />
          <button id="captcha-button" absolute />

          <div class="indicator" />
        </div>
        <div class="Login-Main-Vice only-pc-display">
          <p>微信扫码登录</p>

          <div class="Login-Main-Vice-Wrapper">
            <div v-if="!data.agreement" class="scanned">
              <div i-carbon:list-checked />
              <p>协议</p>
              <span>你需要同意协议</span>
            </div>
            <div v-else-if="codeData.loading" class="scanned">
              <LoadingIcon />
              <p>正在加载</p>
              <span>正在获取验证码</span>
            </div>
            <div v-else-if="codeData.expired" cursor-pointer class="scanned" @click="fetchCode">
              <div i-carbon:ibm-cloud-direct-link-1-dedicated />
              <p>已过期</p>
              <span>点击刷新验证码</span>
            </div>

            <div v-else-if="codeStatus === 4" class="scanned">
              <div i-carbon:notification />
              <p>需要绑定</p>
              <span>请输入手机号进行绑定</span>
            </div>
            <div v-else-if="codeStatus === 3" cursor-pointer class="scanned" @click="fetchCode">
              <div i-carbon:devices />
              <p>正在登录</p>
              <span>请稍等，正在登录...</span>
            </div>
            <div v-else-if="codeStatus !== 0" cursor-pointer class="scanned" @click="fetchCode">
              <div i-carbon:checkmark-filled />
              <p>已扫码</p>
              <span>请在手机上确认登录</span>
            </div>

            <el-image style=" border-radius: 12px;aspect-ratio: 1 / 1;min-height: 120px;" :src="`${codeUrl}`" />
          </div>
        </div>
      </div>

      <div class="Login-Supper">
        <ThCheckBox v-model="data.agreement" />&nbsp;<el-text>
          登录即代表您已阅读同意<el-link
            target="_blank"
            href="https://jcn6saobodid.feishu.cn/wiki/MPcuwXOTAiJdiNklwTpcGTw8nhd?from=from_copylink"
          >
            《使用服务协议》
          </el-link>和<el-link
            target="_blank"
            href="https://jcn6saobodid.feishu.cn/wiki/UXqQwvdn6iLLd6k5WKrcWrdcnab?from=from_copylink"
          >
            《用户隐私协议》
          </el-link>
        </el-text>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.Login-Main-Vice-Wrapper {
  position: relative;

  .scanned {
    & > div {
      width: 32px;
      height: 32px;

      // color: var(--el-color-success);
    }

    z-index: 1;
    position: absolute;
    padding: 1rem;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    display: flex;
    align-items: center;
    flex-direction: column;
    justify-content: center;

    border-radius: 12px;
    background: var(--el-overlay-color-lighter);
    backdrop-filter: blur(5px);
    color: white;
    font-size: 14px;

    & > div {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
  }

  .el-image {
    min-height: 172px;
    min-width: 172px;

    width: 172px;
    height: 172px;
  }
}

.Login-Main-Major {
  .el-form {
    display: flex;

    flex-direction: column;

    gap: 1.5rem;

    .el-input {
      --el-input-bg-color: #0000 !important;
    }
  }

  width: 60%;
}

@keyframes arrow_shaving {
  0%,
  100% {
    width: 60px;
    transform: translateX(10px);
  }

  50% {
    width: 50px;
    transform: translateX(0px);
  }
}

@keyframes arrow_shaving_before {
  0%,
  100% {
    width: 30px;
    transform: translate(-1px, 0px) rotate(45deg);
  }

  50% {
    width: 25px;
    transform: translate(-1px, 0px) rotate(30deg);
  }
}

@keyframes arrow_shaving_after {
  0%,
  100% {
    width: 30px;
    transform: translate(-2px, 1px) rotate(-45deg);
    filter: drop-shadow(0 0 2px var(--el-color-primary));
  }

  50% {
    width: 25px;
    transform: translate(-2px, 1px) rotate(-30deg);
    filter: drop-shadow(0 0 16px var(--el-color-primary));
  }
}

.indicator {
  .bind & {
    opacity: 1;
  }

  &::before,
  &::after {
    z-index: 1;
    content: '';
    position: absolute;

    top: 0;
    left: 2px;

    width: 30px;
    height: 4px;

    border-radius: 8px;
    transition: cubic-bezier(0.165, 0.84, 0.44, 1);
    background-color: var(--el-color-primary);
  }

  &::before {
    transform: translate(-1px, 0px) rotate(45deg);
    animation: arrow_shaving_before 1s infinite;
    transform-origin: left top;
  }

  &::after {
    transform: translate(-2px, 1px) rotate(-45deg);
    animation: arrow_shaving_after 1s infinite;
    transform-origin: left top;
  }

  z-index: 10;
  position: absolute;

  top: 108px;
  left: 355px;

  width: 60px;
  height: 5px;

  opacity: 0;
  transition: 0.25s;
  border-radius: 8px;
  animation: arrow_shaving 1s infinite;
  background-color: var(--el-color-primary);
  filter: drop-shadow(0 0 4px var(--el-color-primary));
}

.Login-Main-Vice {
  padding-left: 2rem;

  border-left: 1px solid var(--el-border-color);

  width: 40%;
}

.Login-Main {
  & div > p {
    margin: 0.75rem 0 2rem;

    font-size: 16px;
    font-weight: 600;
  }

  z-index: 5;
  position: relative;
  display: flex;
  padding: 1rem 2rem;

  gap: 2rem;
  justify-content: space-between;

  height: calc(100% - 200px);
}

.Login-Supper {
  position: absolute;
  display: flex;

  align-items: center;
  justify-content: center;

  left: 50%;
  bottom: 0;

  width: max-content;
  max-width: 80%;
  height: 80px;

  opacity: 0.75;
  font-size: 14px;

  transform: translateX(-50%);
}

.Login-Head {
  .login-core {
    position: absolute;

    top: 1rem;
    right: 2rem;
  }

  .name {
    &::before {
      content: '';
      position: absolute;

      left: 0;
      bottom: 0;

      height: 2px;
      width: 100%;

      border-radius: 4px;
      background: linear-gradient(
        to right,
        var(--el-color-primary),
        var(--el-bg-color-page),
        var(--el-color-primary)
      );
    }

    position: relative;
  }

  position: relative;
  padding: 1.5rem;

  font-size: 24px;

  height: 120px;
  overflow: hidden;
  background-color: var(--el-bg-color-page);
}

.Login-Container {
  .show & {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }

  position: absolute;
  // padding: 1rem;

  top: 50%;
  left: 50%;

  width: 620px;
  height: 500px;

  opacity: 0;
  overflow: hidden;
  border-radius: 16px;
  box-sizing: border-box;
  box-shadow: var(--el-box-shadow);
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  transform: translate(-50%, -50%) scale(1.25);
  transition: 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);
}

// 如果屏幕宽高太小
@media screen and (max-width: 375px) {
  div.Login-Container {
    top: 10%;
    left: 1rem;

    width: calc(100% - 2rem) !important;
    height: 80% !important;

    transform: translate(0, 0) scale(1) !important;
  }
}

@media screen and (max-height: 500px) {
  div.Login-Container {
    top: 10%;
    left: 1rem;

    width: calc(100% - 2rem) !important;
    height: 80% !important;

    transform: translate(0, 0) scale(1) !important;
  }
}

.Login {
  &.show {
    opacity: 1;
    pointer-events: all;
  }

  z-index: 1000;
  position: absolute;

  top: 0;
  left: 0;

  width: 100%;
  height: 100%;

  opacity: 0;
  pointer-events: none;
  background: var(--el-overlay-color-lighter);
  backdrop-filter: blur(18px) saturate(180%);
  transition: 0.25s cubic-bezier(0.785, 0.135, 0.15, 0.86);
}

.mobile .Login-Container {
  .Login-Main-Major {
    width: 100%;
  }

  width: 95%;
  height: 60%;
}
</style>

<script setup lang="ts">
import ThCheckBox from '~/components/checkbox/ThCheckBox.vue'
import { emailLogin, emailRegister } from '~/composables/api/auth'
import { hydratePilotSessionUser } from '~/composables/user'
import LoadingIcon from '../icon/LoadingIcon.vue'
import LoginCore from './login/LoginCore.vue'

const props = defineProps<{
  show: boolean
}>()

const emits = defineEmits<{
  (e: 'update:show', show: boolean): void
}>()

const route = useRoute()
const show = useVModel(props, 'show', emits)
const activeTab = ref<'email-login' | 'email-register' | 'sms'>('email-login')

const authForm = reactive({
  email: '',
  password: '',
  nickname: '',
  agreement: true,
  loading: false,
})

const nexusLoginHref = computed(() => {
  const returnTo = route.fullPath || '/'
  return `/auth/login?returnTo=${encodeURIComponent(returnTo)}`
})

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function isLikelyEmail(email: string): boolean {
  const atIndex = email.indexOf('@')
  if (atIndex <= 0 || atIndex >= email.length - 1) {
    return false
  }

  const domain = email.slice(atIndex + 1)
  if (!domain || domain.startsWith('.') || domain.endsWith('.')) {
    return false
  }

  return domain.includes('.')
}

function validateAuthInput(options: { register: boolean }): string | null {
  if (!authForm.agreement) {
    return '请先同意服务协议和隐私协议'
  }

  const email = normalizeEmail(authForm.email)
  if (!email || !isLikelyEmail(email)) {
    return '请输入正确的邮箱地址'
  }

  if (!authForm.password || authForm.password.length < 6) {
    return '密码至少 6 位'
  }

  if (authForm.password.length > 128) {
    return '密码长度需不超过 128 位'
  }

  if (options.register && authForm.nickname.trim().length > 32) {
    return '昵称长度需不超过 32 位'
  }

  return null
}

async function refreshAfterLogin() {
  const hasSession = await hydratePilotSessionUser()
  if (!hasSession) {
    ElMessage.error('登录状态同步失败，请刷新页面后重试')
    return
  }

  ElMessage.success('登录成功')
  show.value = false
}

async function submitEmailLogin() {
  const errorMessage = validateAuthInput({ register: false })
  if (errorMessage) {
    ElMessage.warning(errorMessage)
    return
  }

  authForm.loading = true
  try {
    const response: any = await emailLogin(normalizeEmail(authForm.email), authForm.password)
    if (response.code !== 200) {
      ElMessage.error(response.message || '登录失败，请稍后重试')
      return
    }
    await refreshAfterLogin()
  }
  catch (error: any) {
    ElMessage.error(error?.message || '登录失败，请稍后重试')
  }
  finally {
    authForm.loading = false
  }
}

async function submitEmailRegister() {
  const errorMessage = validateAuthInput({ register: true })
  if (errorMessage) {
    ElMessage.warning(errorMessage)
    return
  }

  authForm.loading = true
  try {
    const response: any = await emailRegister(
      normalizeEmail(authForm.email),
      authForm.password,
      authForm.nickname.trim(),
    )
    if (response.code !== 200) {
      ElMessage.error(response.message || '注册失败，请稍后重试')
      return
    }
    await refreshAfterLogin()
  }
  catch (error: any) {
    ElMessage.error(error?.message || '注册失败，请稍后重试')
  }
  finally {
    authForm.loading = false
  }
}

function handleComingSoonClick() {
  ElMessage.info('短信与二维码登录正在迁移到 Nexus，敬请期待。')
}
</script>

<template>
  <div :class="{ show }" class="Login" @click="show = false">
    <div class="Login-Container" @click.stop>
      <div class="Login-Head">
        <h1 font-bold>
          <p>登录后可同步会话</p>
          尽情和<span class="name">ThisAI</span>畅聊
        </h1>

        <LoginCore />
      </div>

      <div class="Login-Main">
        <div class="Login-Main-Major">
          <el-tabs v-model="activeTab">
            <el-tab-pane name="email-login" label="邮箱登录">
              <br>

              <el-form>
                <el-input v-model="authForm.email" autocomplete="email" placeholder="name@example.com" size="large">
                  <template #prepend>邮箱</template>
                </el-input>
                <el-input
                  v-model="authForm.password"
                  autocomplete="current-password"
                  type="password"
                  placeholder="至少 6 位密码"
                  size="large"
                >
                  <template #prepend>密码</template>
                </el-input>
                <el-button
                  v-wave
                  :loading="authForm.loading"
                  size="large"
                  type="primary"
                  @click="submitEmailLogin"
                >
                  登录
                </el-button>
              </el-form>
            </el-tab-pane>
            <el-tab-pane name="email-register" label="邮箱注册">
              <br>

              <el-form>
                <el-input v-model="authForm.nickname" maxlength="32" placeholder="默认使用邮箱前缀" size="large">
                  <template #prepend>昵称</template>
                </el-input>
                <el-input v-model="authForm.email" autocomplete="email" placeholder="name@example.com" size="large">
                  <template #prepend>邮箱</template>
                </el-input>
                <el-input
                  v-model="authForm.password"
                  autocomplete="new-password"
                  type="password"
                  placeholder="至少 6 位密码"
                  size="large"
                >
                  <template #prepend>密码</template>
                </el-input>
                <el-button
                  v-wave
                  :loading="authForm.loading"
                  size="large"
                  type="primary"
                  @click="submitEmailRegister"
                >
                  注册并登录
                </el-button>
              </el-form>
            </el-tab-pane>
            <el-tab-pane name="sms" label="短信登录">
              <div class="coming-soon-panel">
                <p>短信验证码登录将迁移至 Nexus。</p>
                <span>当前版本请使用邮箱登录，或使用右侧 Nexus 登录入口。</span>
                <el-button v-wave type="primary" plain @click="handleComingSoonClick">
                  即将上线
                </el-button>
              </div>
            </el-tab-pane>
          </el-tabs>

          <div class="indicator" />
        </div>
        <div class="Login-Main-Vice only-pc-display">
          <p>Nexus 登录</p>

          <div class="Login-Main-Vice-Wrapper">
            <div class="scanned">
              <LoadingIcon />
              <p>即将上线</p>
              <span>微信二维码登录将迁移到 Nexus</span>
              <a class="nexus-beta-link" :href="nexusLoginHref">Nexus 登录（Beta）</a>
            </div>
            <div class="login-qrcode-placeholder">
              <div i-carbon:qr-code />
            </div>
          </div>
        </div>
      </div>

      <div class="Login-Supper">
        <ThCheckBox v-model="authForm.agreement" />&nbsp;<el-text>
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
        <a class="nexus-beta-link" :href="nexusLoginHref">Nexus 登录（Beta）</a>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.coming-soon-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.5rem 0;
  color: var(--el-text-color-regular);
  font-size: 13px;
}

.coming-soon-panel p {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.coming-soon-panel span {
  color: var(--el-text-color-secondary);
}

.nexus-beta-link {
  color: var(--el-color-primary);
  text-decoration: none;
  font-size: 12px;
  font-weight: 600;
}

.nexus-beta-link:hover {
  text-decoration: underline;
}

.login-qrcode-placeholder {
  width: 172px;
  height: 172px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  color: #ffffff30;
  background: #1f2937;
}

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

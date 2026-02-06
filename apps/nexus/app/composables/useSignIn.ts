import { hasWindow } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { toast } from 'vue-sonner'
import { useAuthLoadingState } from '~/composables/useAuthState'
import { base64UrlToBuffer, serializeCredential } from '~/utils/webauthn'

type AuthStep = 'email' | 'login' | 'signup' | 'bind-email' | 'passkey' | 'oauth' | 'success'
type AuthFlow = 'login' | 'bind'
export type LoginMethod = 'passkey' | 'password' | 'magic' | 'github' | 'linuxdo'
export type OauthProvider = 'github' | 'linuxdo'
interface OauthState {
  flow: AuthFlow
  provider?: OauthProvider | null
  redirect?: string | null
  ts: number
}

const LAST_LOGIN_METHOD_KEY = 'tuff_last_login_method'
const OAUTH_STATE_KEY = 'tuff_oauth_state'
const OAUTH_STATE_TTL = 10 * 60 * 1000
const LOGIN_METHODS: LoginMethod[] = ['passkey', 'password', 'magic', 'github', 'linuxdo']

function resolveErrorMessage(error: any, fallback: string) {
  return error?.data?.statusMessage || error?.message || fallback
}

function isValidEmail(value: string) {
  return value.includes('@')
}

export function useSignIn() {
  const { t, locale, setLocale } = useI18n()
  const route = useRoute()
  const { signIn, status } = useAuth()

  const step = ref<AuthStep>('email')
  const email = ref('')
  const password = ref('')
  const confirmPassword = ref('')
  const bindEmail = ref('')
  const loading = ref(false)
  const signupLoading = ref(false)
  const passkeyLoading = ref(false)
  const magicLoading = ref(false)
  const emailCheckLoading = ref(false)
  const bindLoading = ref(false)
  const oauthLoading = ref(false)
  const oauthFlow = ref<AuthFlow>('login')
  const oauthProvider = ref<OauthProvider | null>(null)
  const oauthPhase = ref<'idle' | 'redirect' | 'verifying' | 'error'>('idle')
  const oauthError = ref('')
  const oauthPending = ref(false)
  const oauthHandled = ref(false)
  const oauthRedirect = ref<string | null>(null)
  const magicSent = ref(false)
  const supportsPasskey = ref(false)
  const lastLoginMethod = ref<LoginMethod | null>(null)
  const reauthNotified = ref(false)
  const passkeyPhase = ref<'idle' | 'prepare' | 'prompt' | 'verifying' | 'error' | 'success'>('idle')
  const passkeyError = ref('')

  let passkeyTimer: ReturnType<typeof setTimeout> | null = null
  let successTimer: ReturnType<typeof setTimeout> | null = null

  if (hasWindow()) {
    const storedMethod = window.localStorage.getItem(LAST_LOGIN_METHOD_KEY)
    if (storedMethod && LOGIN_METHODS.includes(storedMethod as LoginMethod)) {
      lastLoginMethod.value = storedMethod as LoginMethod
    }
  }

  const canToast = import.meta.client

  function notify(type: 'error' | 'success' | 'warning', message: string) {
    if (!canToast)
      return
    if (type === 'error')
      toast.error(message)
    if (type === 'success')
      toast.success(message)
    if (type === 'warning')
      toast.warning(message)
  }

  function recordLoginMethod(method: LoginMethod) {
    lastLoginMethod.value = method
    if (hasWindow())
      window.localStorage.setItem(LAST_LOGIN_METHOD_KEY, method)
  }

  function readOauthState(): OauthState | null {
    if (!hasWindow())
      return null
    const raw = window.localStorage.getItem(OAUTH_STATE_KEY)
    if (!raw)
      return null
    try {
      const parsed = JSON.parse(raw) as OauthState
      if (!parsed?.ts)
        return null
      if (Date.now() - parsed.ts > OAUTH_STATE_TTL) {
        window.localStorage.removeItem(OAUTH_STATE_KEY)
        return null
      }
      return parsed
    }
    catch {
      window.localStorage.removeItem(OAUTH_STATE_KEY)
      return null
    }
  }

  function persistOauthState(flow: AuthFlow, provider: OauthProvider | null, redirect: string | null) {
    if (!hasWindow())
      return
    const payload: OauthState = {
      flow,
      provider,
      redirect,
      ts: Date.now(),
    }
    window.localStorage.setItem(OAUTH_STATE_KEY, JSON.stringify(payload))
  }

  function clearPersistedOauthState() {
    if (!hasWindow())
      return
    window.localStorage.removeItem(OAUTH_STATE_KEY)
  }

  function clearPasskeyTimer() {
    if (!passkeyTimer)
      return
    clearTimeout(passkeyTimer)
    passkeyTimer = null
  }

  function clearSuccessTimer() {
    if (!successTimer)
      return
    clearTimeout(successTimer)
    successTimer = null
  }

  function resetPasskeyState() {
    clearPasskeyTimer()
    clearSuccessTimer()
    passkeyPhase.value = 'idle'
    passkeyError.value = ''
    passkeyLoading.value = false
  }

  function resetOauthState() {
    oauthPhase.value = 'idle'
    oauthError.value = ''
    oauthProvider.value = null
    oauthFlow.value = 'login'
    oauthRedirect.value = null
    oauthPending.value = false
    oauthHandled.value = false
    clearPersistedOauthState()
  }

  async function clearOauthContext() {
    resetOauthState()
    if (!route.query.oauth && !route.query.flow && !route.query.provider)
      return
    const nextQuery = { ...route.query } as Record<string, any>
    delete nextQuery.oauth
    delete nextQuery.flow
    delete nextQuery.provider
    await navigateTo({ path: route.path, query: nextQuery }, { replace: true })
  }

  const redirectTarget = computed(() => {
    const redirect = route.query.redirect_url
    if (typeof redirect === 'string' && redirect.length > 0) {
      return redirect
    }
    return '/dashboard'
  })

  const flowParam = computed(() => {
    const raw = route.query.flow
    if (!raw)
      return null
    const value = Array.isArray(raw) ? raw[0] : raw
    if (value === 'bind' || value === 'login')
      return value
    return null
  })

  const providerParam = computed(() => {
    const raw = route.query.provider
    if (!raw)
      return null
    const value = Array.isArray(raw) ? raw[0] : raw
    if (value === 'github' || value === 'linuxdo')
      return value as OauthProvider
    return null
  })

  const langParam = computed(() => {
    const raw = route.query.lang
    if (!raw)
      return null
    const value = Array.isArray(raw) ? raw[0] : raw
    return value || null
  })

  const reasonParam = computed(() => {
    const raw = route.query.reason
    if (!raw)
      return null
    return Array.isArray(raw) ? raw[0] : raw
  })

  const localeFromQuery = computed(() => {
    const param = langParam.value
    if (!param)
      return null
    const normalized = param.toLowerCase()
    if (normalized.startsWith('zh'))
      return 'zh'
    if (normalized.startsWith('en'))
      return 'en'
    return null
  })

  watchEffect(() => {
    const next = localeFromQuery.value
    if (next && next !== locale.value)
      setLocale(next)
  })

  watchEffect(() => {
    if (!canToast)
      return
    if (reasonParam.value !== 'reauth')
      return
    if (reauthNotified.value)
      return
    reauthNotified.value = true
    notify('warning', t('auth.sessionExpired', '登录信息已失效，请重新登录。'))
  })

  watchEffect(() => {
    if (flowParam.value) {
      oauthFlow.value = flowParam.value
      oauthPending.value = true
    }
    if (providerParam.value)
      oauthProvider.value = providerParam.value
    if (oauthParam.value === '1')
      oauthPending.value = true
    if (oauthPending.value && !oauthRedirect.value)
      oauthRedirect.value = redirectTarget.value
  })

  const langTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))

  const forgotUrl = computed(() => {
    const params = new URLSearchParams({
      lang: langTag.value,
    })
    return `/forgot-password?${params.toString()}`
  })

  function buildOauthCallbackUrl(flow: AuthFlow, provider: OauthProvider) {
    const params = new URLSearchParams({
      lang: langTag.value,
      redirect_url: redirectTarget.value,
      oauth: '1',
      flow,
      provider,
    })
    return `/sign-in?${params.toString()}`
  }

  const emailPreview = computed(() => email.value.trim().toLowerCase())
  const lastLoginLabel = computed(() => {
    switch (lastLoginMethod.value) {
      case 'passkey':
        return t('auth.loginMethodPasskey', 'Passkey')
      case 'password':
        return t('auth.loginMethodPassword', '密码')
      case 'magic':
        return t('auth.loginMethodMagic', 'Magic Link')
      case 'github':
        return t('auth.loginMethodGithub', 'GitHub')
      case 'linuxdo':
        return t('auth.loginMethodLinuxdo', 'LinuxDO')
      default:
        return ''
    }
  })

  const oauthProviderLabel = computed(() => {
    if (oauthProvider.value === 'github')
      return 'GitHub'
    if (oauthProvider.value === 'linuxdo')
      return 'LinuxDO'
    return t('auth.oauthProvider', '第三方')
  })
  const oauthParam = computed(() => {
    const raw = route.query.oauth
    if (!raw)
      return null
    return Array.isArray(raw) ? raw[0] : raw
  })

  const oauthReturn = computed(() => oauthParam.value === '1' || oauthPending.value)
  const oauthTarget = computed(() => oauthRedirect.value || redirectTarget.value)

  const stepTitle = computed(() => {
    if (step.value === 'email')
      return t('auth.emailStepTitle', '输入邮箱')
    if (step.value === 'signup')
      return t('auth.signUpTitle', '创建账号')
    if (step.value === 'passkey')
      return t('auth.passkeyTitle', 'Passkey 登录')
    if (step.value === 'oauth') {
      if (oauthFlow.value === 'bind')
        return t('auth.oauthBindTitle', `正在绑定 ${oauthProviderLabel.value}`)
      return t('auth.oauthTitle', `正在连接 ${oauthProviderLabel.value}`)
    }
    if (step.value === 'success')
      return t('auth.signInSuccess', '登录成功')
    if (step.value === 'bind-email')
      return t('auth.bindEmailTitle', '补全邮箱')
    return t('auth.signInTitle', '登录 Tuff')
  })

  const stepSubtitle = computed(() => {
    if (step.value === 'email')
      return t('auth.emailStepSubtitle', t('auth.signInSubtitle', '支持邮箱与 SSO 登录。'))
    if (step.value === 'signup')
      return t('auth.signUpSubtitle', '使用邮箱创建账号，或选择 Passkey。')
    if (step.value === 'passkey')
      return t('auth.passkeySubtitle', '将调用系统 Passkey 完成验证。')
    if (step.value === 'oauth') {
      if (oauthPhase.value === 'redirect')
        return t('auth.oauthRedirectSubtitle', `即将前往 ${oauthProviderLabel.value} 完成授权。`)
      if (oauthPhase.value === 'error')
        return t('auth.oauthErrorSubtitle', '登录遇到问题，请重试。')
      if (oauthFlow.value === 'bind')
        return t('auth.oauthBindSubtitle', '正在验证绑定状态...')
      return t('auth.oauthVerifyingSubtitle', '正在验证账号信息...')
    }
    if (step.value === 'success')
      return t('auth.signInSuccessSubtitle', '正在跳转...')
    if (step.value === 'bind-email')
      return t('auth.bindEmailSubtitle', '补充邮箱完成账号配置，可稍后。')
    return t('auth.loginStepSubtitle', '请输入密码或使用 Magic Link 登录。')
  })

  const showTurnstile = computed(() => step.value === 'login' || step.value === 'signup')
  const passkeyBusy = computed(() => {
    return passkeyPhase.value === 'prepare'
      || passkeyPhase.value === 'prompt'
      || passkeyPhase.value === 'verifying'
      || passkeyPhase.value === 'success'
  })
  const { loading: authLoading } = useAuthLoadingState([
    loading,
    signupLoading,
    passkeyLoading,
    magicLoading,
    emailCheckLoading,
    bindLoading,
    oauthLoading,
    passkeyBusy,
  ])

  watch(step, (value) => {
    magicSent.value = false
    if (value !== 'passkey' && value !== 'success')
      resetPasskeyState()
    if (value !== 'oauth')
      resetOauthState()
  })

  onMounted(() => {
    supportsPasskey.value = hasWindow() && Boolean(window.PublicKeyCredential)
    const storedOauth = readOauthState()
    if (storedOauth) {
      oauthPending.value = true
      oauthFlow.value = storedOauth.flow
      oauthProvider.value = storedOauth.provider ?? oauthProvider.value
      oauthRedirect.value = storedOauth.redirect ?? null
    }
  })

  onBeforeUnmount(() => {
    clearPasskeyTimer()
    clearSuccessTimer()
  })

  watchEffect(async () => {
    if (oauthParam.value !== '1')
      return
    if (status.value !== 'authenticated')
      return
    if (oauthLoading.value)
      return
    oauthLoading.value = true
    try {
      const profile = await $fetch<any>('/api/auth/me')
      if (profile?.emailState === 'missing') {
        step.value = 'bind-email'
        bindEmail.value = ''
        return
      }
      await navigateTo(redirectTarget.value)
    }
    catch (error: any) {
      notify('error', resolveErrorMessage(error, t('auth.loginFailed', 'Login failed')))
    }
    finally {
      oauthLoading.value = false
    }
  })

  async function handleEmailNext() {
    magicSent.value = false
    if (!emailPreview.value || !isValidEmail(emailPreview.value)) {
      notify('error', t('auth.invalidEmail', '请输入有效邮箱'))
      return
    }
    emailCheckLoading.value = true
    try {
      const result = await $fetch<{ exists: boolean, status: string }>('/api/auth/email-status', {
        query: { email: emailPreview.value },
      })
      if (result.status !== 'active') {
        notify('error', t('auth.accountDisabled', '账号不可用'))
        return
      }
      step.value = result.exists ? 'login' : 'signup'
    }
    catch (error: any) {
      notify('error', resolveErrorMessage(error, t('auth.loginFailed', 'Login failed')))
    }
    finally {
      emailCheckLoading.value = false
    }
  }

  function resetToEmailStep() {
    step.value = 'email'
    password.value = ''
    confirmPassword.value = ''
    bindEmail.value = ''
    magicSent.value = false
    void clearOauthContext()
  }

  async function handlePasswordSignIn() {
    magicSent.value = false
    loading.value = true
    try {
      const result = await signIn('credentials', {
        email: emailPreview.value,
        password: password.value,
        redirect: false,
      })
      if (result?.error) {
        notify('error', result.error)
        return
      }
      recordLoginMethod('password')
      await navigateTo(redirectTarget.value)
    }
    catch (error: any) {
      notify('error', resolveErrorMessage(error, t('auth.loginFailed', 'Login failed')))
    }
    finally {
      loading.value = false
    }
  }

  async function handleMagicLink() {
    magicSent.value = false
    if (!emailPreview.value || !isValidEmail(emailPreview.value)) {
      notify('error', t('auth.invalidEmail', '请输入有效邮箱'))
      return
    }
    recordLoginMethod('magic')
    magicLoading.value = true
    try {
      const result = await signIn('email', {
        email: emailPreview.value,
        redirect: false,
        callbackUrl: redirectTarget.value,
      })
      if (result?.error) {
        notify('error', result.error)
        return
      }
      magicSent.value = true
      notify('success', t('auth.magicSent', '已发送 Magic Link'))
      await navigateTo({
        path: '/verify-waiting',
        query: {
          email: emailPreview.value,
          lang: langTag.value,
        },
      })
    }
    catch (error: any) {
      notify('error', resolveErrorMessage(error, t('auth.magicLinkFailed', 'Failed to send magic link')))
    }
    finally {
      magicLoading.value = false
    }
  }

  async function handleRegister() {
    if (!emailPreview.value || !isValidEmail(emailPreview.value)) {
      notify('error', t('auth.invalidEmail', '请输入有效邮箱'))
      return
    }
    if (password.value.length < 8) {
      notify('error', t('auth.passwordTooShort', '密码至少 8 位'))
      return
    }
    if (password.value !== confirmPassword.value) {
      notify('error', t('auth.passwordMismatch', '两次密码不一致'))
      return
    }

    signupLoading.value = true
    try {
      await $fetch('/api/auth/register', {
        method: 'POST',
        body: {
          email: emailPreview.value,
          password: password.value,
        },
      })
      await navigateTo({
        path: '/verify-waiting',
        query: { email: emailPreview.value },
      })
    }
    catch (error: any) {
      notify('error', resolveErrorMessage(error, t('auth.registerFailed', '注册失败')))
    }
    finally {
      signupLoading.value = false
    }
  }

  async function handleBindEmail() {
    if (!bindEmail.value || !isValidEmail(bindEmail.value)) {
      notify('error', t('auth.invalidEmail', '请输入有效邮箱'))
      return
    }
    bindLoading.value = true
    try {
      await $fetch('/api/auth/bind-email', {
        method: 'POST',
        body: {
          email: bindEmail.value.trim().toLowerCase(),
        },
      })
      await navigateTo(redirectTarget.value)
    }
    catch (error: any) {
      notify('error', resolveErrorMessage(error, t('auth.loginFailed', 'Login failed')))
    }
    finally {
      bindLoading.value = false
    }
  }

  async function handleSkipBind() {
    bindLoading.value = true
    try {
      await $fetch('/api/auth/bind-email', {
        method: 'POST',
        body: {
          skip: true,
        },
      })
      await navigateTo(redirectTarget.value)
    }
    catch (error: any) {
      notify('error', resolveErrorMessage(error, t('auth.loginFailed', 'Login failed')))
    }
    finally {
      bindLoading.value = false
    }
  }

  async function startOauthSignIn(provider: OauthProvider, fallbackMessage: string) {
    if (oauthLoading.value)
      return
    oauthFlow.value = 'login'
    oauthProvider.value = provider
    oauthPhase.value = 'redirect'
    oauthError.value = ''
    oauthPending.value = true
    oauthHandled.value = false
    oauthRedirect.value = redirectTarget.value
    persistOauthState('login', provider, redirectTarget.value)
    recordLoginMethod(provider)
    if (step.value !== 'oauth') {
      step.value = 'oauth'
      await nextTick()
    }
    await new Promise(resolve => setTimeout(resolve, 180))
    oauthLoading.value = true
    try {
      await signIn(provider, { callbackUrl: buildOauthCallbackUrl('login', provider) })
    }
    catch (error: any) {
      const message = resolveErrorMessage(error, fallbackMessage)
      oauthPhase.value = 'error'
      oauthError.value = message
      notify('error', message)
      oauthLoading.value = false
    }
  }

  async function handleGithubSignIn() {
    await startOauthSignIn('github', t('auth.githubFailed', 'GitHub sign-in failed'))
  }

  async function handleLinuxdoSignIn() {
    await startOauthSignIn('linuxdo', t('auth.linuxdoFailed', 'LinuxDO sign-in failed'))
  }

  async function handleOauthRetry() {
    if (oauthProvider.value === 'github') {
      await handleGithubSignIn()
      return
    }
    if (oauthProvider.value === 'linuxdo') {
      await handleLinuxdoSignIn()
      return
    }
    resetToEmailStep()
  }

  async function handlePasskeySignIn() {
    if (passkeyLoading.value)
      return
    passkeyError.value = ''
    passkeyPhase.value = 'prepare'
    if (step.value !== 'passkey') {
      step.value = 'passkey'
      await nextTick()
    }

    const prepareDelay = 240
    const promptDelay = 360

    clearPasskeyTimer()
    passkeyTimer = setTimeout(() => {
      if (step.value !== 'passkey')
        return
      passkeyPhase.value = 'prompt'
      clearPasskeyTimer()
      passkeyTimer = setTimeout(() => {
        void startPasskeyAuth()
      }, promptDelay)
    }, prepareDelay)
  }

  async function startPasskeyAuth() {
    if (!supportsPasskey.value) {
      const message = t('auth.passkeyNotSupported', 'Passkeys not supported in this browser.')
      passkeyPhase.value = 'error'
      passkeyError.value = message
      notify('error', message)
      return
    }

    passkeyLoading.value = true
    passkeyPhase.value = 'verifying'

    try {
      const options = await $fetch<any>(
        '/api/passkeys/options',
        emailPreview.value ? { query: { email: emailPreview.value } } : undefined,
      )
      const allowCredentials = Array.isArray(options.allowCredentials)
        ? options.allowCredentials.map((cred: any) => ({
            ...cred,
            id: base64UrlToBuffer(cred.id),
          }))
        : undefined
      const publicKey: PublicKeyCredentialRequestOptions = {
        challenge: base64UrlToBuffer(options.challenge),
        rpId: options.rpId,
        timeout: options.timeout,
        userVerification: options.userVerification,
        ...(allowCredentials ? { allowCredentials } : {}),
      }

      const credential = await navigator.credentials.get({ publicKey }) as PublicKeyCredential | null
      if (!credential) {
        notify('warning', t('auth.passkeyCancelled', 'Passkey cancelled.'))
        passkeyPhase.value = 'error'
        passkeyError.value = t('auth.passkeyCancelled', 'Passkey cancelled.')
        return
      }

      const payload = serializeCredential(credential)
      const { token } = await $fetch<{ token: string }>('/api/passkeys/verify', {
        method: 'POST',
        body: { credential: payload },
      })

      const result = await signIn('credentials', { loginToken: token, redirect: false })
      if (result?.error) {
        passkeyError.value = result.error
        notify('error', result.error)
        passkeyPhase.value = 'error'
        return
      }
      recordLoginMethod('passkey')
      passkeyPhase.value = 'success'
      step.value = 'success'
      clearSuccessTimer()
      successTimer = setTimeout(() => {
        void navigateTo(redirectTarget.value)
      }, 700)
    }
    catch (error: any) {
      const message = resolveErrorMessage(error, t('auth.passkeyFailed', 'Passkey login failed'))
      passkeyError.value = message
      passkeyPhase.value = 'error'
      notify('error', message)
    }
    finally {
      passkeyLoading.value = false
    }
  }

  return {
    t,
    step,
    email,
    password,
    confirmPassword,
    bindEmail,
    loading,
    signupLoading,
    passkeyLoading,
    magicLoading,
    emailCheckLoading,
    bindLoading,
    magicSent,
    supportsPasskey,
    passkeyPhase,
    passkeyError,
    authLoading,
    lastLoginMethod,
    lastLoginLabel,
    emailPreview,
    stepTitle,
    stepSubtitle,
    showTurnstile,
    forgotUrl,
    handleEmailNext,
    resetToEmailStep,
    handlePasswordSignIn,
    handleMagicLink,
    handleRegister,
    handleBindEmail,
    handleSkipBind,
    handleGithubSignIn,
    handleLinuxdoSignIn,
    handlePasskeySignIn,
  }
}

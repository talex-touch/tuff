import { hasWindow } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { toast } from 'vue-sonner'
import {
  buildOauthCallbackUrl,
  clearOauthContext,
  persistOauthContext,
  readOauthContext,
  resolveOauthContext,
  sanitizeRedirect,
  type AuthFlow,
  type OauthContext,
  type OauthProvider,
} from '~/composables/useOauthContext'
import { useAuthLoadingState } from '~/composables/useAuthState'
import { base64UrlToBuffer, serializeCredential } from '~/utils/webauthn'

import { fetchCurrentUserProfile } from '~/composables/useCurrentUserApi'
type AuthStep = 'email' | 'login' | 'signup' | 'bind-email' | 'passkey' | 'oauth' | 'success'
export type LoginMethod = 'passkey' | 'password' | 'magic' | 'github' | 'linuxdo'
type TurnstileAction = 'login' | 'signup'
type TurnstileState = 'idle' | 'loading' | 'ready' | 'error'

const LAST_LOGIN_METHOD_KEY = 'tuff_last_login_method'
const LOGIN_METHODS: LoginMethod[] = ['passkey', 'password', 'magic', 'github', 'linuxdo']
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const CALLBACK_FEEDBACK_MIN_MS = 800

type TurnstileWidgetId = string | number
interface TurnstileRenderOptions {
  sitekey: string
  theme?: 'light' | 'dark' | 'auto'
  action?: string
  callback?: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: (errorCode?: string) => void
}
interface TurnstileApi {
  render: (container: string | HTMLElement, options: TurnstileRenderOptions) => TurnstileWidgetId
  reset: (widgetId?: TurnstileWidgetId) => void
  remove?: (widgetId?: TurnstileWidgetId) => void
}

let turnstileScriptPromise: Promise<void> | null = null

function resolveErrorMessage(error: any, fallback: string) {
  return error?.data?.statusMessage || error?.message || fallback
}

function isValidEmail(value: string) {
  return value.includes('@')
}

function pickFirstQueryValue(input: unknown) {
  if (!input)
    return null
  if (Array.isArray(input))
    return typeof input[0] === 'string' ? input[0] : null
  return typeof input === 'string' ? input : null
}

function waitForCallbackFeedback(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

export function useSignIn() {
  const { t, locale, setLocale } = useI18n()
  const route = useRoute()
  const router = useRouter()
  const { signIn, status, getSession } = useAuth()
  const runtimeConfig = useRuntimeConfig()

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
  const oauthHandled = ref(false)
  const oauthSessionCheckDone = ref(false)
  const oauthSessionChecking = ref(false)
  const redirectSessionCheckDone = ref(false)
  const redirectSessionChecking = ref(false)
  const redirectAutoNavigating = ref(false)
  const magicSent = ref(false)
  const supportsPasskey = ref(false)
  const lastLoginMethod = ref<LoginMethod | null>(null)
  const reauthNotified = ref(false)
  const storedOauthContext = ref<OauthContext | null>(import.meta.client ? readOauthContext() : null)
  const passkeyPhase = ref<'idle' | 'prepare' | 'prompt' | 'verifying' | 'error' | 'success'>('idle')
  const passkeyError = ref('')
  const turnstileToken = ref('')
  const turnstileWidgetId = ref<TurnstileWidgetId | null>(null)
  const turnstileAction = ref<TurnstileAction | null>(null)
  const turnstileState = ref<TurnstileState>('idle')

  let passkeyTimer: ReturnType<typeof setTimeout> | null = null
  let successTimer: ReturnType<typeof setTimeout> | null = null
  let turnstileRenderSeq = 0

  if (hasWindow()) {
    const storedMethod = window.localStorage.getItem(LAST_LOGIN_METHOD_KEY)
    if (storedMethod && LOGIN_METHODS.includes(storedMethod as LoginMethod))
      lastLoginMethod.value = storedMethod as LoginMethod
  }

  const canToast = import.meta.client
  const turnstileSiteKey = computed(() => {
    return typeof runtimeConfig.public?.turnstile?.siteKey === 'string'
      ? runtimeConfig.public.turnstile.siteKey.trim()
      : ''
  })
  const turnstileEnabled = computed(() => Boolean(turnstileSiteKey.value))

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

  function resolveCredentialsSignInMessage(errorCode: string) {
    const normalized = errorCode.trim()
    if (normalized.includes('CredentialsSignin'))
      return t('auth.credentialsInvalid', '邮箱或密码错误')
    if (normalized.includes('AccessDenied'))
      return t('auth.accountDisabled', '账号不可用')
    return t('auth.loginFailed', '登录失败')
  }

  function getTurnstileApi() {
    if (!hasWindow())
      return null
    return (window as any).turnstile as TurnstileApi | undefined
  }

  function getExpectedTurnstileAction(): TurnstileAction {
    return step.value === 'signup' ? 'signup' : 'login'
  }

  function maskTurnstileSiteKey(siteKey: string) {
    if (!siteKey)
      return 'empty'
    if (siteKey.length <= 8)
      return siteKey
    return `${siteKey.slice(0, 4)}...${siteKey.slice(-4)}`
  }

  function isStaleTurnstileRender(seq: number) {
    return seq !== turnstileRenderSeq || !showTurnstile.value
  }

  function logTurnstileContext(stage: string, action?: TurnstileAction) {
    if (!hasWindow())
      return

    console.info('[turnstile] context', {
      stage,
      action,
      state: turnstileState.value,
      hostname: window.location.hostname,
      origin: window.location.origin,
      siteKey: maskTurnstileSiteKey(turnstileSiteKey.value),
      hasWidget: turnstileWidgetId.value !== null,
    })
  }

  function markTurnstileError(stage: string, error?: unknown) {
    turnstileRenderSeq += 1

    logTurnstileContext(stage, turnstileAction.value || getExpectedTurnstileAction())
    if (hasWindow())
      console.error('[turnstile]', stage, error)

    const turnstile = getTurnstileApi()
    const widgetId = turnstileWidgetId.value
    if (turnstile && widgetId !== null) {
      try {
        turnstile.remove?.(widgetId)
      }
      catch (removeError) {
        if (hasWindow())
          console.error('[turnstile]', 'remove_failed', removeError)
      }
    }

    turnstileToken.value = ''
    turnstileWidgetId.value = null
    turnstileAction.value = null
    turnstileState.value = 'error'
  }

  function removeTurnstileWidget() {
    turnstileRenderSeq += 1

    const turnstile = getTurnstileApi()
    const widgetId = turnstileWidgetId.value
    if (turnstile && widgetId !== null) {
      try {
        turnstile.remove?.(widgetId)
      }
      catch (error) {
        if (hasWindow())
          console.error('[turnstile]', 'remove_failed', error)
      }
    }

    turnstileToken.value = ''
    turnstileWidgetId.value = null
    turnstileAction.value = null
    turnstileState.value = 'idle'
  }

  async function loadTurnstileScript() {
    if (!turnstileEnabled.value || !hasWindow())
      return

    if (getTurnstileApi())
      return

    if (!turnstileScriptPromise) {
      turnstileScriptPromise = new Promise<void>((resolve, reject) => {
        const script = window.document.createElement('script')
        script.src = TURNSTILE_SCRIPT_SRC
        script.async = true
        script.defer = true
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('Failed to load Turnstile script'))
        window.document.head.appendChild(script)
      }).catch((error) => {
        turnstileScriptPromise = null
        throw error
      })
    }

    await turnstileScriptPromise
  }

  function resetTurnstileWidget() {
    turnstileToken.value = ''

    if (!turnstileEnabled.value || !showTurnstile.value)
      return

    const turnstile = getTurnstileApi()
    const widgetId = turnstileWidgetId.value
    if (!turnstile || widgetId === null || turnstileState.value === 'loading')
      return

    try {
      turnstile.reset(widgetId)
      turnstileState.value = 'ready'
    }
    catch (error) {
      turnstileRenderSeq += 1
      if (hasWindow())
        console.error('[turnstile]', 'reset_failed', error)

      try {
        turnstile.remove?.(widgetId)
      }
      catch (removeError) {
        if (hasWindow())
          console.error('[turnstile]', 'remove_failed', removeError)
      }

      turnstileWidgetId.value = null
      turnstileAction.value = null
      turnstileState.value = 'error'
    }
  }

  function requireTurnstileToken() {
    if (!turnstileEnabled.value)
      return true

    if (turnstileToken.value)
      return true

    if (turnstileState.value === 'loading') {
      notify('warning', t('auth.turnstileLoading', '安全验证准备中，请稍候'))
      return false
    }

    if (turnstileState.value === 'error') {
      notify('warning', t('auth.turnstilePending', '安全验证暂未就绪，请点击重试'))
      return false
    }

    notify('error', t('auth.turnstileRequired', '请先完成人机验证'))
    return false
  }

  async function ensureTurnstileWidget() {
    if (!turnstileEnabled.value || !showTurnstile.value || !hasWindow())
      return

    const renderSeq = ++turnstileRenderSeq
    turnstileState.value = 'loading'

    try {
      await loadTurnstileScript()
    }
    catch (error) {
      if (isStaleTurnstileRender(renderSeq))
        return
      markTurnstileError('load_script_failed', error)
      return
    }

    if (isStaleTurnstileRender(renderSeq))
      return

    await nextTick()

    if (isStaleTurnstileRender(renderSeq))
      return

    const expectedAction = getExpectedTurnstileAction()
    logTurnstileContext('before_render', expectedAction)

    const container = window.document.getElementById('turnstile-container')
    const turnstile = getTurnstileApi()
    if (!container || !turnstile) {
      markTurnstileError('container_or_api_missing')
      return
    }

    if (turnstileWidgetId.value !== null) {
      if (turnstileAction.value === expectedAction) {
        turnstileState.value = 'ready'
        return
      }
      try {
        turnstile.remove?.(turnstileWidgetId.value)
      }
      catch (error) {
        if (hasWindow())
          console.error('[turnstile]', 'remove_failed', error)
      }
      turnstileWidgetId.value = null
      turnstileToken.value = ''
    }

    try {
      turnstileWidgetId.value = turnstile.render(container, {
        sitekey: turnstileSiteKey.value,
        theme: 'dark',
        action: expectedAction,
        callback: (token: string) => {
          if (isStaleTurnstileRender(renderSeq))
            return
          turnstileToken.value = token
          turnstileState.value = 'ready'
        },
        'expired-callback': () => {
          if (isStaleTurnstileRender(renderSeq))
            return
          turnstileToken.value = ''
          turnstileState.value = 'ready'
        },
        'error-callback': (errorCode?: string) => {
          if (isStaleTurnstileRender(renderSeq))
            return
          markTurnstileError('widget_error', errorCode)
        },
      })

      if (isStaleTurnstileRender(renderSeq)) {
        const widgetId = turnstileWidgetId.value
        if (widgetId !== null) {
          try {
            turnstile.remove?.(widgetId)
          }
          catch (error) {
            if (hasWindow())
              console.error('[turnstile]', 'remove_failed', error)
          }
        }
        return
      }

      turnstileAction.value = expectedAction
      turnstileState.value = 'ready'
      logTurnstileContext('render_ok', expectedAction)
    }
    catch (error) {
      markTurnstileError('render_failed', error)
    }
  }

  async function retryTurnstile() {
    if (!showTurnstile.value)
      return
    removeTurnstileWidget()
    await ensureTurnstileWidget()
  }

  function resolveOauthRouteErrorMessage() {
    const error = oauthErrorParam.value
    if (!error)
      return ''

    const description = oauthErrorDescriptionParam.value
    const normalized = error.toLowerCase()
    if (normalized.includes('accessdenied') || normalized.includes('access_denied')) {
      return t('auth.oauthCancelled', '你已取消授权，可返回并选择其他方式。')
    }

    if (description)
      return description

    return t('auth.oauthError', '登录失败，请重试。')
  }

  function recordLoginMethod(method: LoginMethod) {
    lastLoginMethod.value = method
    if (hasWindow())
      window.localStorage.setItem(LAST_LOGIN_METHOD_KEY, method)
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
    oauthFlow.value = 'login'
    oauthPhase.value = 'idle'
    oauthError.value = ''
    oauthProvider.value = null
  }

  function syncOauthProvider() {
    if (oauthProvider.value)
      return
    if (lastLoginMethod.value === 'github' || lastLoginMethod.value === 'linuxdo')
      oauthProvider.value = lastLoginMethod.value
  }

  function refreshStoredOauthContext() {
    storedOauthContext.value = readOauthContext()
  }

  const callbackUrlParam = computed(() => {
    const query = route.query as Record<string, unknown>
    return pickFirstQueryValue(query.callbackUrl) ?? pickFirstQueryValue(query.callback_url)
  })

  const callbackQueryParams = computed(() => {
    const raw = callbackUrlParam.value
    if (!raw)
      return null

    const parseParams = (value: string) => {
      try {
        const base = hasWindow() ? window.location.origin : 'http://localhost'
        const parsed = value.startsWith('/') ? new URL(value, base) : new URL(value)
        return parsed.searchParams
      }
      catch {
        return null
      }
    }

    const hasOauthSignal = (params: URLSearchParams | null) => {
      if (!params)
        return false
      return Boolean(
        params.get('oauth')
        || params.get('flow')
        || params.get('provider')
        || params.get('redirect_url')
        || params.get('error')
        || params.get('error_description'),
      )
    }

    const parsed = parseParams(raw)
    const parsedOauth = parsed?.get('oauth') ?? null
    const hasMergedOauth = Boolean(parsedOauth && parsedOauth.includes('&'))

    if (hasOauthSignal(parsed) && !hasMergedOauth)
      return parsed

    try {
      const decoded = decodeURIComponent(raw)
      if (decoded !== raw) {
        const decodedParams = parseParams(decoded)
        if (hasOauthSignal(decodedParams))
          return decodedParams
        return decodedParams ?? parsed
      }
    }
    catch {
      return parsed
    }

    return parsed
  })

  function pickQueryValue(key: string) {
    const query = route.query as Record<string, unknown>
    const direct = pickFirstQueryValue(query[key])
    if (direct)
      return direct

    const nested = callbackQueryParams.value?.get(key)
    return nested && nested.length > 0 ? nested : null
  }

  const oauthParam = computed(() => pickQueryValue('oauth'))
  const flowParam = computed(() => pickQueryValue('flow'))
  const providerParam = computed(() => pickQueryValue('provider'))
  const redirectParam = computed(() => pickQueryValue('redirect_url'))
  const langParam = computed(() => pickQueryValue('lang'))
  const reasonParam = computed(() => pickQueryValue('reason'))
  const oauthErrorParam = computed(() => pickQueryValue('error'))
  const oauthErrorDescriptionParam = computed(() => pickQueryValue('error_description'))

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

  const langTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))
  const forgotUrl = computed(() => {
    const params = new URLSearchParams({
      lang: langTag.value,
    })
    return `/forgot-password?${params.toString()}`
  })

  const isOauthErrorCallback = computed(() => Boolean(oauthErrorParam.value) && Boolean(storedOauthContext.value))
  const isOauthCallback = computed(() => oauthParam.value === '1' || isOauthErrorCallback.value)
  const oauthReturn = computed(() => isOauthCallback.value)
  const hasExplicitRedirect = computed(() => Boolean(redirectParam.value))
  const isSessionVerifying = computed(() => {
    if (status.value === 'authenticated')
      return false

    const oauthVerifying = oauthReturn.value && oauthSessionChecking.value
    const redirectVerifying = !oauthReturn.value && hasExplicitRedirect.value && redirectSessionChecking.value
    return oauthVerifying || redirectVerifying
  })

  const oauthContext = computed(() => {
    const fallbackFlow = flowParam.value === 'bind' || storedOauthContext.value?.flow === 'bind'
      ? 'bind'
      : 'login'

    return resolveOauthContext({
      query: {
        flow: flowParam.value,
        provider: providerParam.value,
        redirect: redirectParam.value,
      },
      stored: storedOauthContext.value,
      fallbackFlow,
      fallbackRedirect: fallbackFlow === 'bind' ? '/dashboard/account' : '/dashboard',
    })
  })

  const stickyRedirectTarget = ref('/dashboard')

  watchEffect(() => {
    if (redirectParam.value)
      stickyRedirectTarget.value = sanitizeRedirect(redirectParam.value, stickyRedirectTarget.value)
  })

  watchEffect(() => {
    if (!oauthReturn.value)
      return

    oauthFlow.value = oauthContext.value.flow
    stickyRedirectTarget.value = sanitizeRedirect(
      oauthContext.value.redirect,
      oauthFlow.value === 'bind' ? '/dashboard/account' : stickyRedirectTarget.value,
    )

    if (oauthContext.value.provider)
      oauthProvider.value = oauthContext.value.provider
    else
      syncOauthProvider()
  })

  const redirectTarget = computed(() => stickyRedirectTarget.value)
  const shouldHoldRedirectForReauth = computed(() => {
    if (reasonParam.value !== 'reauth')
      return false
    return isAuthCallbackTarget(redirectTarget.value)
  })

  function isAuthCallbackTarget(target: string) {
    return target.startsWith('/auth/app-callback')
  }

  function isSignInTarget(target: string) {
    return target.startsWith('/sign-in')
  }

  function isProtectedTarget(target: string) {
    try {
      return router.resolve(target).matched.some(record => record.meta?.requiresAuth === true)
    }
    catch {
      return false
    }
  }

  function resolveSafeBackTarget(target: string, fallback = '/') {
    const normalized = sanitizeRedirect(target, fallback)
    if (isAuthCallbackTarget(normalized))
      return fallback
    if (isProtectedTarget(normalized) && status.value !== 'authenticated')
      return fallback
    return normalized
  }

  const backTarget = computed(() => {
    if (oauthFlow.value === 'bind')
      return sanitizeRedirect(redirectTarget.value, '/dashboard/account')
    return sanitizeRedirect(redirectTarget.value, '/')
  })

  const safeBackTarget = computed(() => resolveSafeBackTarget(backTarget.value, '/'))

  async function ensureCallbackProcessingFeedback(startedAt: number) {
    const elapsed = Date.now() - startedAt
    if (elapsed >= CALLBACK_FEEDBACK_MIN_MS)
      return

    await waitForCallbackFeedback(CALLBACK_FEEDBACK_MIN_MS - elapsed)
  }

  function withOauthBoundHint(target: string, provider: OauthProvider | null) {
    if (!provider)
      return target

    try {
      const base = hasWindow() ? window.location.origin : 'http://localhost'
      const parsed = target.startsWith('/') ? new URL(target, base) : new URL(`/${target}`, base)
      parsed.searchParams.set('oauth_bound', provider)
      return `${parsed.pathname}${parsed.search}${parsed.hash}`
    }
    catch {
      return target
    }
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

  const showTurnstile = computed(() => {
    return turnstileEnabled.value && (step.value === 'login' || step.value === 'signup')
  })
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
    isSessionVerifying,
  ])

  watch(step, (value) => {
    magicSent.value = false
    if (value !== 'passkey' && value !== 'success')
      resetPasskeyState()

    if (value !== 'login' && value !== 'signup') {
      removeTurnstileWidget()
      return
    }

    void ensureTurnstileWidget()
  })

  onMounted(() => {
    supportsPasskey.value = hasWindow() && Boolean(window.PublicKeyCredential)
    refreshStoredOauthContext()

    if (!isOauthCallback.value && storedOauthContext.value) {
      clearOauthContext()
      storedOauthContext.value = null
    }

    if (showTurnstile.value)
      void ensureTurnstileWidget()
  })

  onBeforeUnmount(() => {
    clearPasskeyTimer()
    clearSuccessTimer()
    removeTurnstileWidget()
  })

  async function clearOauthQuery() {
    if (!route.query.oauth && !route.query.provider && !route.query.flow && !route.query.redirect_url && !route.query.error && !route.query.error_description && !route.query.callbackUrl && !route.query.callback_url)
      return

    const nextQuery = { ...route.query } as Record<string, string | string[]>
    delete nextQuery.oauth
    delete nextQuery.provider
    delete nextQuery.flow
    delete nextQuery.redirect_url
    delete nextQuery.error
    delete nextQuery.error_description
    delete nextQuery.callbackUrl
    delete nextQuery.callback_url

    const scrollY = hasWindow() ? window.scrollY : 0
    await router.replace({ path: route.path, query: nextQuery, hash: route.hash })

    if (!hasWindow())
      return

    await nextTick()
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' })
    })
  }

  async function clearOauthRuntime(clearQuery = true) {
    clearOauthContext()
    storedOauthContext.value = null
    oauthHandled.value = false
    if (clearQuery)
      await clearOauthQuery()
  }

  async function startOauth(provider: OauthProvider, flow: AuthFlow) {
    oauthFlow.value = flow
    oauthProvider.value = provider
    oauthPhase.value = 'redirect'
    oauthError.value = ''
    step.value = 'oauth'
    oauthHandled.value = false

    const callbackUrl = buildOauthCallbackUrl({
      flow,
      provider,
      redirect: redirectTarget.value,
      lang: langTag.value,
    })

    persistOauthContext({
      flow,
      provider,
      redirect: redirectTarget.value,
    })
    refreshStoredOauthContext()

    try {
      recordLoginMethod(provider)
      await signIn(provider, { callbackUrl })
    }
    catch (error: any) {
      await clearOauthRuntime(false)
      oauthPhase.value = 'error'
      oauthError.value = resolveErrorMessage(
        error,
        provider === 'github'
          ? t('auth.githubFailed', 'GitHub sign-in failed')
          : t('auth.linuxdoFailed', 'LinuxDO sign-in failed'),
      )
      notify('error', oauthError.value)
    }
  }

  async function handleOauthRouteError(routeOauthError: string) {
    const callbackStartedAt = Date.now()
    oauthLoading.value = true
    oauthPhase.value = 'verifying'
    step.value = 'oauth'

    await ensureCallbackProcessingFeedback(callbackStartedAt)

    clearOauthContext()
    storedOauthContext.value = null
    oauthPhase.value = 'error'
    oauthError.value = routeOauthError
    oauthLoading.value = false
  }

  async function handleOauthCallback() {
    if (oauthHandled.value || oauthLoading.value)
      return

    const callbackStartedAt = Date.now()
    oauthHandled.value = true
    oauthLoading.value = true
    oauthError.value = ''
    oauthPhase.value = 'verifying'
    step.value = 'oauth'

    const flow = oauthContext.value.flow
    const provider = oauthContext.value.provider
    const target = sanitizeRedirect(
      oauthContext.value.redirect,
      flow === 'bind' ? '/dashboard/account' : '/dashboard',
    )

    oauthFlow.value = flow
    oauthProvider.value = provider

    try {
      if (flow === 'bind') {
        const bindTarget = withOauthBoundHint(target, provider)
        await clearOauthRuntime()
        await ensureCallbackProcessingFeedback(callbackStartedAt)
        await navigateTo(bindTarget)
        return
      }

      const profile = await fetchCurrentUserProfile()
      if (profile?.emailState === 'missing') {
        await clearOauthRuntime()
        await ensureCallbackProcessingFeedback(callbackStartedAt)
        step.value = 'bind-email'
        bindEmail.value = ''
        resetOauthState()
        return
      }

      await clearOauthRuntime()
      await ensureCallbackProcessingFeedback(callbackStartedAt)
      await navigateTo(target)
    }
    catch (error: any) {
      await clearOauthRuntime()
      await ensureCallbackProcessingFeedback(callbackStartedAt)
      oauthPhase.value = 'error'
      oauthError.value = resolveErrorMessage(error, t('auth.loginFailed', 'Login failed'))
      if (provider)
        oauthProvider.value = provider
      oauthFlow.value = flow
      step.value = 'oauth'
      notify('error', oauthError.value)
    }
    finally {
      oauthLoading.value = false
    }
  }

  watchEffect(() => {
    if (!oauthReturn.value)
      return

    const routeOauthError = resolveOauthRouteErrorMessage()
    if (routeOauthError) {
      if (oauthHandled.value || oauthLoading.value)
        return

      oauthHandled.value = true
      void handleOauthRouteError(routeOauthError)
      return
    }

    if (step.value !== 'oauth' && step.value !== 'bind-email' && step.value !== 'success')
      step.value = 'oauth'

    if (oauthPhase.value === 'idle')
      oauthPhase.value = 'verifying'
  })

  watchEffect(() => {
    if (import.meta.server)
      return

    if (!oauthReturn.value) {
      oauthSessionCheckDone.value = false
      oauthSessionChecking.value = false
      return
    }
    if (resolveOauthRouteErrorMessage())
      return
    if (status.value === 'authenticated')
      return
    if (oauthSessionCheckDone.value || oauthSessionChecking.value)
      return

    oauthSessionChecking.value = true
    void getSession()
      .catch(() => {})
      .finally(() => {
        oauthSessionChecking.value = false
        oauthSessionCheckDone.value = true
      })
  })

  watchEffect(() => {
    if (!oauthReturn.value)
      return
    if (resolveOauthRouteErrorMessage())
      return
    if (status.value !== 'authenticated')
      return
    if (oauthLoading.value || oauthHandled.value)
      return
    void handleOauthCallback()
  })

  watchEffect(() => {
    if (import.meta.server)
      return

    if (!hasExplicitRedirect.value || oauthReturn.value) {
      redirectSessionCheckDone.value = false
      redirectSessionChecking.value = false
      return
    }

    if (shouldHoldRedirectForReauth.value)
      return

    if (status.value === 'authenticated')
      return
    if (redirectSessionCheckDone.value || redirectSessionChecking.value)
      return

    redirectSessionChecking.value = true
    void getSession()
      .catch(() => {})
      .finally(() => {
        redirectSessionChecking.value = false
        redirectSessionCheckDone.value = true
      })
  })

  watchEffect(() => {
    if (import.meta.server)
      return

    if (!hasExplicitRedirect.value || oauthReturn.value)
      return
    if (shouldHoldRedirectForReauth.value)
      return
    if (status.value !== 'authenticated')
      return
    if (redirectAutoNavigating.value)
      return

    const target = sanitizeRedirect(redirectTarget.value, '/dashboard')
    if (isSignInTarget(target))
      return

    redirectAutoNavigating.value = true
    void (async () => {
      try {
        await navigateTo(target, { replace: true })
      }
      finally {
        redirectAutoNavigating.value = false
      }
    })()
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

  async function resetToEmailStep() {
    await clearOauthRuntime()
    resetOauthState()
    step.value = 'email'
    password.value = ''
    confirmPassword.value = ''
    bindEmail.value = ''
    magicSent.value = false
  }

  async function handlePasswordSignIn() {
    if (!requireTurnstileToken())
      return

    const token = turnstileToken.value
    magicSent.value = false
    loading.value = true
    try {
      const result = await signIn('credentials', {
        email: emailPreview.value,
        password: password.value,
        turnstileToken: token,
        redirect: false,
      })
      if (result?.error) {
        if (hasWindow())
          console.warn('[auth]', 'credentials_signin_failed', result.error)
        notify('error', resolveCredentialsSignInMessage(result.error))
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
      resetTurnstileWidget()
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
    if (!requireTurnstileToken())
      return

    const token = turnstileToken.value

    signupLoading.value = true
    try {
      await $fetch('/api/auth/register', {
        method: 'POST',
        body: {
          email: emailPreview.value,
          password: password.value,
          turnstileToken: token,
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
      resetTurnstileWidget()
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

  async function handleGithubSignIn() {
    await startOauth('github', 'login')
  }

  async function handleLinuxdoSignIn() {
    await startOauth('linuxdo', 'login')
  }

  async function handleOauthRetry() {
    const provider = oauthProvider.value
    if (!provider) {
      await resetToEmailStep()
      return
    }
    await startOauth(provider, oauthFlow.value)
  }

  async function handleOauthBack() {
    if (oauthFlow.value !== 'bind') {
      await resetToEmailStep()
      return
    }

    await clearOauthRuntime()
    resetOauthState()
    await router.push(safeBackTarget.value)
  }

  async function handleHeaderBack() {
    if (oauthReturn.value || storedOauthContext.value)
      await clearOauthRuntime()

    await router.push(safeBackTarget.value)
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
    oauthFlow,
    oauthProvider,
    oauthPhase,
    oauthError,
    authLoading,
    isSessionVerifying,
    lastLoginMethod,
    lastLoginLabel,
    emailPreview,
    stepTitle,
    stepSubtitle,
    showTurnstile,
    turnstileState,
    forgotUrl,
    retryTurnstile,
    handleEmailNext,
    resetToEmailStep,
    handlePasswordSignIn,
    handleMagicLink,
    handleRegister,
    handleBindEmail,
    handleSkipBind,
    handleGithubSignIn,
    handleLinuxdoSignIn,
    handleOauthRetry,
    handleOauthBack,
    handleHeaderBack,
    handlePasskeySignIn,
  }
}

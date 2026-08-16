import { hasWindow } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import {
  buildOauthCallbackUrl,
  clearOauthContext,
  persistOauthContext,
  requestOauthAuthorizationUrl,
  readOauthContext,
  resolveOauthContext,
  sanitizeRedirect,
  type AuthFlow,
  type OauthContext,
  type OauthProvider,
} from '~/composables/useOauthContext'
import { pickFirstQueryValue, sanitizeOauthRedirectTarget } from '~/composables/sign-in-redirect-utils'
import { useAuthLoadingState } from '~/composables/useAuthState'
import { requestJson } from '~/utils/request'
import { base64UrlToBuffer, serializeCredential } from '~/utils/webauthn'

import { fetchCurrentUserProfile } from '~/composables/useCurrentUserApi'
type AuthStep = 'email' | 'bind-email' | 'passkey' | 'oauth' | 'success'
export type LoginMethod = 'passkey' | 'magic' | 'github' | 'linuxdo'

const LAST_LOGIN_METHOD_KEY = 'tuff_last_login_method'
const LOGIN_METHODS: LoginMethod[] = ['passkey', 'magic', 'github', 'linuxdo']
const CALLBACK_FEEDBACK_MIN_MS = 800

interface PasskeyRequestOptionsResponse {
  challenge: string
  rpId?: string
  timeout?: number
  userVerification?: UserVerificationRequirement
  allowCredentials?: Array<{
    id: string
    type: PublicKeyCredentialType
    transports?: AuthenticatorTransport[]
  }>
}


function resolveErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object')
    return fallback

  if ('data' in error && error.data && typeof error.data === 'object' && 'statusMessage' in error.data) {
    const statusMessage = error.data.statusMessage
    if (typeof statusMessage === 'string' && statusMessage)
      return statusMessage
  }

  if ('message' in error && typeof error.message === 'string' && error.message)
    return error.message

  return fallback
}

function isValidEmail(value: string) {
  return value.includes('@')
}

function waitForCallbackFeedback(ms: number) {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

async function waitForLinkedProvider(provider: OauthProvider, maxAttempts = 6, intervalMs = 250) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const profile = await requestJson<{ linkedAccounts?: Array<{ provider?: string }> }>('/api/user/me', {
        query: { _oauthCheckAt: Date.now() },
        cache: 'no-store',
        headers: {
          'cache-control': 'no-cache',
          pragma: 'no-cache',
        },
      })
      const linked = Boolean(profile?.linkedAccounts?.some(account => account.provider === provider))
      if (linked)
        return true
    }
    catch {
      // Ignore transient read errors during OAuth callback convergence and retry.
    }

    if (attempt < maxAttempts - 1)
      await waitForCallbackFeedback(intervalMs)
  }

  return false
}

export function useSignIn() {
  const { t } = useI18n()
  const toast = useToast()
  const route = useRoute()
  const router = useRouter()
  const { signIn, signOut, status, getSession } = useNexusAuth()

  const step = ref<AuthStep>('email')
  const email = ref('')
  const bindEmail = ref('')
  const passkeyLoading = ref(false)
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
  const redirectAutoNavigationStarted = ref(false)
  const supportsPasskey = ref(false)
  const lastLoginMethod = ref<LoginMethod | null>(null)
  const reauthNotified = ref(false)
  const storedOauthContext = ref<OauthContext | null>(import.meta.client ? readOauthContext() : null)
  const passkeyPhase = ref<'idle' | 'prepare' | 'prompt' | 'verifying' | 'error' | 'success'>('idle')
  const passkeyError = ref('')

  let passkeyTimer: ReturnType<typeof setTimeout> | null = null
  let successTimer: ReturnType<typeof setTimeout> | null = null

  if (hasWindow()) {
    const storedMethod = window.localStorage.getItem(LAST_LOGIN_METHOD_KEY)
    if (storedMethod && LOGIN_METHODS.includes(storedMethod as LoginMethod))
      lastLoginMethod.value = storedMethod as LoginMethod
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



  function resolveOauthRouteErrorMessage() {
    const error = oauthErrorParam.value
    if (!error)
      return ''

    const description = oauthErrorDescriptionParam.value
    const normalized = error.toLowerCase()
    if (normalized.includes('accessdenied') || normalized.includes('access_denied')) {
      return t('auth.oauthCancelled', '你已取消授权，可返回并选择其他方式。')
    }
    if (normalized.includes('oauthaccountnotlinked')) {
      return t('auth.oauthAccountNotLinked', 'This OAuth account is already linked to another user.')
    }
    if (normalized.includes('oauthsignin') || normalized.includes('oauthcallback')) {
      return t('auth.oauthProviderError', 'OAuth provider callback failed. Please check provider configuration and try again.')
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

  const directOauthParam = computed(() => {
    const query = route.query as Record<string, unknown>
    return pickFirstQueryValue(query.oauth)
  })
  const directOauthRelayParam = computed(() => {
    const query = route.query as Record<string, unknown>
    return pickFirstQueryValue(query.oauth_relay)
  })
  const directOauthErrorParam = computed(() => {
    const query = route.query as Record<string, unknown>
    return pickFirstQueryValue(query.error)
  })

  const flowParam = computed(() => pickQueryValue('flow'))
  const providerParam = computed(() => pickQueryValue('provider'))
  const redirectParam = computed(() => pickQueryValue('redirect_url'))
  const reasonParam = computed(() => pickQueryValue('reason'))
  const forceReauthParam = computed(() => pickQueryValue('force_reauth'))
  const oauthErrorParam = computed(() => pickQueryValue('error'))
  const oauthErrorDescriptionParam = computed(() => pickQueryValue('error_description'))

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


  const oauthRelayRequested = computed(() => directOauthRelayParam.value === '1')
  const isOauthErrorCallback = computed(() => Boolean(directOauthErrorParam.value) && Boolean(storedOauthContext.value))
  const isOauthCallback = computed(() => (directOauthParam.value === '1' || isOauthErrorCallback.value) && !oauthRelayRequested.value)
  const oauthReturn = computed(() => isOauthCallback.value || oauthRelayRequested.value)
  const oauthCallbackReady = computed(() => isOauthCallback.value)
  const hasExplicitRedirect = computed(() => Boolean(redirectParam.value))
  const isSessionVerifying = computed(() => {
    if (status.value === 'authenticated')
      return false

    const oauthVerifying = oauthCallbackReady.value && oauthSessionChecking.value
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
  const oauthRelayLaunching = ref(false)
  const oauthRelayAttempted = ref(false)

  watchEffect(() => {
    if (redirectParam.value)
      stickyRedirectTarget.value = sanitizeOauthRedirectTarget(redirectParam.value, stickyRedirectTarget.value)
  })

  watchEffect(() => {
    if (!oauthReturn.value)
      return

    oauthFlow.value = oauthContext.value.flow
    stickyRedirectTarget.value = sanitizeOauthRedirectTarget(
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
    if (forceReauthParam.value === '1')
      return true
    return isAuthCallbackTarget(redirectTarget.value)
  })

  const forceReauthHandled = ref(false)

  watchEffect(() => {
    if (reasonParam.value !== 'reauth')
      return
    if (forceReauthParam.value !== '1')
      return
    if (forceReauthHandled.value)
      return
    if (status.value !== 'authenticated')
      return
    forceReauthHandled.value = true
    void signOut({ redirect: false })
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

  const emailPreview = computed(() => email.value.trim().toLowerCase())
  const lastLoginLabel = computed(() => {
    switch (lastLoginMethod.value) {
      case 'passkey':
        return t('auth.loginMethodPasskey', 'Passkey')
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
      return t('auth.emailStepTitle', 'Tuff')
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
      return t('auth.emailLinkSubtitle', '输入邮箱，我们会发送一次性登录链接。')
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
    return ''
  })

  const passkeyBusy = computed(() => {
    return passkeyPhase.value === 'prepare'
      || passkeyPhase.value === 'prompt'
      || passkeyPhase.value === 'verifying'
      || passkeyPhase.value === 'success'
  })
  const { loading: authLoading } = useAuthLoadingState([
    passkeyLoading,
    emailCheckLoading,
    bindLoading,
    oauthLoading,
    passkeyBusy,
    isSessionVerifying,
  ])

  watch(step, (value) => {
    if (value !== 'passkey' && value !== 'success')
      resetPasskeyState()
  })

  onMounted(() => {
    supportsPasskey.value = hasWindow() && Boolean(window.PublicKeyCredential)
    refreshStoredOauthContext()

    if (!isOauthCallback.value && storedOauthContext.value) {
      clearOauthContext()
      storedOauthContext.value = null
    }
  })

  onBeforeUnmount(() => {
    clearPasskeyTimer()
    clearSuccessTimer()
  })

  async function clearOauthQuery() {
    if (!route.query.oauth && !route.query.provider && !route.query.flow && !route.query.redirect_url && !route.query.error && !route.query.error_description && !route.query.callbackUrl && !route.query.callback_url && !route.query.oauth_relay)
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
    delete nextQuery.oauth_relay

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

  function resolveOauthStartErrorMessage(error: unknown, provider: OauthProvider) {
    const message = resolveErrorMessage(error, '')
    const [code, detail] = message.split(':')

    if (code === 'oauth_csrf_unavailable')
      return t('auth.oauthCsrfUnavailable', 'Unable to start OAuth flow. Please refresh and try again.')
    if (code === 'oauth_redirect_missing')
      return t('auth.oauthRedirectMissing', 'Authorization redirect is missing. Please try again later.')
    if (code === 'oauth_redirect_fallback') {
      if (detail && (detail.includes('AccessDenied') || detail.includes('access_denied')))
        return t('auth.oauthCancelled', '你已取消授权，可返回并选择其他方式。')
      if (detail && (detail.includes('Configuration') || detail.includes('OAuthSignin') || detail.includes('OAuthCallback')))
        return t('auth.oauthProviderConfigError', 'OAuth provider configuration is invalid. Please contact admin to verify callback URL and app credentials.')
      return t('auth.oauthProviderUnavailable', 'OAuth provider is unavailable right now. Please contact admin.')
    }

    return resolveErrorMessage(
      error,
      provider === 'github'
        ? t('auth.githubFailed', 'GitHub sign-in failed')
        : t('auth.linuxdoFailed', 'LinuxDO sign-in failed'),
    )
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
    })

    persistOauthContext({
      flow,
      provider,
      redirect: redirectTarget.value,
    })
    refreshStoredOauthContext()

    try {
      const authorizationUrl = await requestOauthAuthorizationUrl({
        provider,
        callbackUrl,
      })
      recordLoginMethod(provider)
      if (hasWindow()) {
        window.location.assign(authorizationUrl)
        return
      }
      await navigateTo(authorizationUrl, { external: true })
    }
    catch (error: unknown) {
      await clearOauthRuntime(false)
      oauthPhase.value = 'error'
      oauthError.value = resolveOauthStartErrorMessage(error, provider)
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

  async function handleOauthSessionMissing() {
    if (oauthHandled.value || oauthLoading.value)
      return

    const callbackStartedAt = Date.now()
    const flow = oauthContext.value.flow
    const provider = oauthContext.value.provider

    oauthLoading.value = true
    oauthError.value = ''
    oauthPhase.value = 'verifying'
    step.value = 'oauth'

    try {
      const session = await getSession().catch(() => null)
      if (status.value === 'authenticated' || session?.user) {
        oauthLoading.value = false
        await handleOauthCallback()
        return
      }

      await clearOauthRuntime()
      await ensureCallbackProcessingFeedback(callbackStartedAt)
      oauthHandled.value = true
      oauthPhase.value = 'error'
      oauthError.value = t('auth.oauthSessionMissing', 'OAuth returned without an active session. Please try signing in again.')
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
    const target = sanitizeOauthRedirectTarget(
      oauthContext.value.redirect,
      flow === 'bind' ? '/dashboard/account' : '/dashboard',
    )

    oauthFlow.value = flow
    oauthProvider.value = provider

    try {
      if (flow === 'bind') {
        const linked = provider ? await waitForLinkedProvider(provider) : false
        if (!linked) {
          await clearOauthRuntime()
          await ensureCallbackProcessingFeedback(callbackStartedAt)
          oauthPhase.value = 'error'
          oauthError.value = provider === 'github'
            ? t('auth.githubBindNotDetected', 'GitHub authorization returned, but link was not detected. Please try again.')
            : t('auth.linuxdoBindNotDetected', 'LinuxDO authorization returned, but link was not detected. Please try again.')
          if (provider)
            oauthProvider.value = provider
          oauthFlow.value = flow
          step.value = 'oauth'
          return
        }

        await clearOauthRuntime()
        await ensureCallbackProcessingFeedback(callbackStartedAt)
        await navigateTo(target)
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
    catch (error: unknown) {
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
    if (!oauthRelayRequested.value) {
      oauthRelayLaunching.value = false
      oauthRelayAttempted.value = false
      return
    }
    if (resolveOauthRouteErrorMessage())
      return
    if (oauthRelayAttempted.value)
      return
    if (oauthLoading.value || oauthRelayLaunching.value)
      return

    const provider = oauthContext.value.provider
    if (!provider)
      return

    oauthRelayAttempted.value = true
    oauthRelayLaunching.value = true
    void startOauth(provider, oauthContext.value.flow)
      .finally(() => {
        oauthRelayLaunching.value = false
      })
  })

  watchEffect(() => {
    if (import.meta.server)
      return

    if (!oauthCallbackReady.value) {
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
    if (!oauthCallbackReady.value)
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
    if (!oauthCallbackReady.value)
      return
    if (resolveOauthRouteErrorMessage())
      return
    if (status.value === 'authenticated')
      return
    if (!oauthSessionCheckDone.value || oauthSessionChecking.value)
      return
    if (oauthLoading.value || oauthHandled.value)
      return
    void handleOauthSessionMissing()
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
    if (redirectAutoNavigationStarted.value)
      return

    const target = sanitizeOauthRedirectTarget(redirectTarget.value, '/dashboard')
    if (isSignInTarget(target))
      return

    // Session refresh can finish while the sign-in route is still entering. Vue Router may
    // update browser history but leave this component mounted as a same-route navigation.
    // A document replace keeps the rendered route and URL atomic.
    redirectAutoNavigationStarted.value = true
    window.location.replace(target)
  })

  async function handleEmailNext() {
    if (!emailPreview.value || !isValidEmail(emailPreview.value)) {
      notify('error', t('auth.invalidEmail', '请输入有效邮箱'))
      return
    }

    emailCheckLoading.value = true
    try {
      const result = await signIn('email', {
        email: emailPreview.value,
        redirect: false,
        callbackUrl: redirectTarget.value,
      })
      if (result?.error) {
        notify('error', t('auth.magicLinkFailed', '发送登录链接失败'))
        return
      }
      recordLoginMethod('magic')
      notify('success', t('auth.magicSent', '已发送登录链接'))
      await navigateTo({
        path: '/verify-waiting',
        query: { email: emailPreview.value },
      })
    }
    catch (error: unknown) {
      notify('error', resolveErrorMessage(error, t('auth.magicLinkFailed', '发送登录链接失败')))
    }
    finally {
      emailCheckLoading.value = false
    }
  }

  async function resetToEmailStep() {
    await clearOauthRuntime()
    resetOauthState()
    step.value = 'email'
    bindEmail.value = ''
  }




  async function handleBindEmail() {
    if (!bindEmail.value || !isValidEmail(bindEmail.value)) {
      notify('error', t('auth.invalidEmail', '请输入有效邮箱'))
      return
    }
    bindLoading.value = true
    try {
      await requestJson('/api/auth/bind-email', {
        method: 'POST',
        body: {
          email: bindEmail.value.trim().toLowerCase(),
        },
      })
      await navigateTo(redirectTarget.value)
    }
    catch (error: unknown) {
      notify('error', resolveErrorMessage(error, t('auth.loginFailed', 'Login failed')))
    }
    finally {
      bindLoading.value = false
    }
  }

  async function handleSkipBind() {
    bindLoading.value = true
    try {
      await requestJson('/api/auth/bind-email', {
        method: 'POST',
        body: {
          skip: true,
        },
      })
      await navigateTo(redirectTarget.value)
    }
    catch (error: unknown) {
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
      const options = await requestJson<PasskeyRequestOptionsResponse>(
        '/api/passkeys/options',
        emailPreview.value ? { query: { email: emailPreview.value } } : undefined,
      )
      const allowCredentials = options.allowCredentials?.map(credential => ({
        ...credential,
        id: base64UrlToBuffer(credential.id),
      }))
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
      const { token } = await requestJson<{ token: string }>('/api/passkeys/verify', {
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
    catch (error: unknown) {
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
    bindEmail,
    passkeyLoading,
    emailCheckLoading,
    bindLoading,
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
    handleEmailNext,
    resetToEmailStep,
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

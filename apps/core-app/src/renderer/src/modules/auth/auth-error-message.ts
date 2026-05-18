export type AuthErrorType =
  | 'INITIALIZATION_FAILED'
  | 'SIGN_IN_FAILED'
  | 'SIGN_UP_FAILED'
  | 'SIGN_OUT_FAILED'
  | 'LOGIN_TIMEOUT'
  | 'BROWSER_OPEN_FAILED'
  | 'NETWORK_ERROR'
  | 'AUTH_CALLBACK_FAILED'
  | 'DEVICE_NOT_AUTHORIZED'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'PERMISSION_DENIED'
  | 'SESSION_EXPIRED'
  | 'SERVER_UNAVAILABLE'
  | 'AUTH_ERROR'
  | 'UNKNOWN_ERROR'

type AuthErrorTranslator = (
  key: string,
  fallbackOrParams?: string | Record<string, unknown>
) => string

const ERROR_MESSAGES: Record<AuthErrorType, string> = {
  INITIALIZATION_FAILED: '认证系统初始化失败，请检查网络连接或稍后重试',
  SIGN_IN_FAILED: '登录失败，请检查网络连接或稍后重试',
  SIGN_UP_FAILED: '注册失败，请检查网络连接或稍后重试',
  SIGN_OUT_FAILED: '登出失败，请重试',
  LOGIN_TIMEOUT: '登录超时，请重试',
  BROWSER_OPEN_FAILED: '无法打开浏览器，请手动打开登录页面或稍后重试',
  NETWORK_ERROR: '网络连接失败，请检查网络设置',
  AUTH_CALLBACK_FAILED: '授权回调无效，请重新打开登录页面',
  DEVICE_NOT_AUTHORIZED: '当前设备需要重新授权，请完成浏览器中的安全验证',
  RATE_LIMITED: '登录请求过于频繁，请稍后重试',
  QUOTA_EXCEEDED: '账户配额不足，请检查 Nexus 账户状态',
  PERMISSION_DENIED: '当前账户没有权限执行此操作，请检查账户权限',
  SESSION_EXPIRED: '登录会话已过期，请重新登录',
  SERVER_UNAVAILABLE: 'Nexus 服务暂时不可用，请稍后重试',
  AUTH_ERROR: '认证失败，请重试',
  UNKNOWN_ERROR: '发生未知错误，请重试'
}

const ERROR_MESSAGE_KEYS: Record<AuthErrorType, string> = {
  INITIALIZATION_FAILED: 'settingUser.authErrors.initializationFailed',
  SIGN_IN_FAILED: 'settingUser.authErrors.signInFailed',
  SIGN_UP_FAILED: 'settingUser.authErrors.signUpFailed',
  SIGN_OUT_FAILED: 'settingUser.authErrors.signOutFailed',
  LOGIN_TIMEOUT: 'settingUser.authErrors.loginTimeout',
  BROWSER_OPEN_FAILED: 'settingUser.authErrors.browserOpenFailed',
  NETWORK_ERROR: 'settingUser.authErrors.networkError',
  AUTH_CALLBACK_FAILED: 'settingUser.authErrors.authCallbackFailed',
  DEVICE_NOT_AUTHORIZED: 'settingUser.authErrors.deviceNotAuthorized',
  RATE_LIMITED: 'settingUser.authErrors.rateLimited',
  QUOTA_EXCEEDED: 'settingUser.authErrors.quotaExceeded',
  PERMISSION_DENIED: 'settingUser.authErrors.permissionDenied',
  SESSION_EXPIRED: 'settingUser.authErrors.sessionExpired',
  SERVER_UNAVAILABLE: 'settingUser.authErrors.serverUnavailable',
  AUTH_ERROR: 'settingUser.authErrors.authError',
  UNKNOWN_ERROR: 'settingUser.authErrors.unknownError'
}

function normalizeAuthErrorType(value: string | undefined): AuthErrorType {
  return value && value in ERROR_MESSAGES ? (value as AuthErrorType) : 'UNKNOWN_ERROR'
}

function collectAuthErrorText(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (typeof error === 'number' || typeof error === 'boolean') return String(error)

  if (typeof error !== 'object') {
    return String(error)
  }

  const candidate = error as Record<string, unknown>
  const nested =
    candidate.data && typeof candidate.data === 'object'
      ? (candidate.data as Record<string, unknown>)
      : {}

  return [
    candidate.message,
    candidate.name,
    candidate.error,
    candidate.errorCode,
    candidate.code,
    candidate.status,
    candidate.reason,
    candidate.detail,
    nested.message,
    nested.error,
    nested.errorCode,
    nested.code,
    nested.status,
    String(error)
  ]
    .filter((value): value is string | number => {
      return (typeof value === 'string' && value.trim().length > 0) || typeof value === 'number'
    })
    .join(' ')
}

export function classifyAuthError(error: unknown, defaultType: string): AuthErrorType {
  if (!error) return normalizeAuthErrorType(defaultType)

  const errorText = collectAuthErrorText(error)

  if (
    /browser login timeout|login timeout|device code expired|expired_token|timeout/i.test(errorText)
  ) {
    return 'LOGIN_TIMEOUT'
  }

  if (
    /open browser|browser.*open|unable to open browser|failed to open browser|launch browser/i.test(
      errorText
    )
  ) {
    return 'BROWSER_OPEN_FAILED'
  }

  if (/device_not_authorized|device not authorized|step[-\s]?up|mf2a|mfa/i.test(errorText)) {
    return 'DEVICE_NOT_AUTHORIZED'
  }

  if (
    /missing token|invalid token|auth callback failed|callback.*failed|profile is unavailable/i.test(
      errorText
    )
  ) {
    return 'AUTH_CALLBACK_FAILED'
  }

  if (/rate.?limit|too many requests|\b429\b/i.test(errorText)) {
    return 'RATE_LIMITED'
  }

  if (/quota|credit|insufficient.*balance|\b402\b/i.test(errorText)) {
    return 'QUOTA_EXCEEDED'
  }

  if (/permission denied|forbidden|not allowed|\b403\b/i.test(errorText)) {
    return 'PERMISSION_DENIED'
  }

  if (/session expired|unauthorized|not authenticated|auth required|\b401\b/i.test(errorText)) {
    return 'SESSION_EXPIRED'
  }

  if (/network|fetch|offline|econn|enotfound|dns|socket|connection/i.test(errorText)) {
    return 'NETWORK_ERROR'
  }

  if (
    /server unavailable|bad gateway|service unavailable|gateway timeout|\b500\b|\b502\b|\b503\b|\b504\b/i.test(
      errorText
    )
  ) {
    return 'SERVER_UNAVAILABLE'
  }

  return normalizeAuthErrorType(defaultType)
}

export function resolveAuthErrorMessage(
  error: unknown,
  defaultType: string,
  t?: AuthErrorTranslator
): string {
  const errorType = classifyAuthError(error, defaultType)
  const fallback = ERROR_MESSAGES[errorType]

  if (!t) {
    return fallback
  }

  return t(ERROR_MESSAGE_KEYS[errorType], fallback)
}

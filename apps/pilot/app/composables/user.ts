import './index'
import { getAccountDetail, getPermissionList, getUserSubscription } from './api/account'
import { endHttp } from './api/axios'
import { $endApi } from './api/base'
import { $event } from './events'
import type { QuotaModel } from './api/base/v1/aigc/completion-types'

export interface AccountDetail {
  id: number

  token: {
    accessToken: string
    refreshToken: string
  }

  createdAt: string
  updatedAt: string
  username: string
  nickname: string
  avatar: string
  qq: string
  email: string
  phone: string
  remark: string
  status: number
  roles: string[]
  permissions: string[]
  subscription: any
  dummy: any

  isAdmin: boolean
  isLogin: boolean
}

export const userStore = useLocalStorage<Partial<AccountDetail>>('user', {})

const rawUserConfig = {
  pub_info: {},
  pri_info: {
    cms: {
      expand: false,
      apps: [],
    },
    home: {
      index: {},
      chat: {
        model: 'this-normal',
      },
    },
    info: {
      tutorial: true,
    },
    appearance: {
      theme: '',
      color: 'auto',
      expand: false,
      immersive: true,
    },
  },
  loading: false,
}
export const userConfig = ref<typeof rawUserConfig>(JSON.parse(JSON.stringify(rawUserConfig)))

export const globalConfigModel = computed({
  set(val: string | QuotaModel) {
    userConfig.value.pri_info.home.chat.model = val as unknown as string
  },
  get() {
    return userConfig.value.pri_info.home.chat.model
  },
})

watch(() => userStore.value.token?.accessToken, (token) => {
  if (token) {
    userStore.value.isLogin = true
  }
}, { immediate: true })

watch(() => userStore.value.isLogin, () => {
  if (!userStore.value.isLogin)
    return false

  const isAdmin = userStore.value.roles?.find((item: any) => item.id === 1) || !!userStore.value.permissions?.find((item: any) => item === 'system:manage')

  Object.assign(userStore.value, {
    isAdmin,
  })
}, { immediate: true })

// manually trigger
async function _saveUserConfig() {
  const res = await $endApi.v1.account.postUserConfig(
    JSON.stringify(userConfig.value.pub_info),
    JSON.stringify(userConfig.value.pri_info),
  )

  userConfig.value.loading = false

  return responseMessage(res, {
    success: '',
    triggerOnDataNull: false,
  })
}

export const saveUserConfig = useDebounceFn(_saveUserConfig)

$event.on('USER_LOGOUT_SUCCESS', async (type) => {
  if (!userStore.value.isLogin)
    console.warn(`User not login now.`)

  userStore.value = { ...userStore.value, token: { accessToken: '', refreshToken: '' }, id: undefined, permissions: [], phone: undefined, roles: [], subscription: undefined }
  userConfig.value = JSON.parse(JSON.stringify(rawUserConfig))

  const router = useRouter()

  document.body.classList.remove('ULTIMATE', 'STANDARD', 'DEV')

  await router.push('/')

  if (type === LogoutType.TOKEN_EXPIRED) {
    ElMessage({
      message: '登录超时，请重新登录！',
      grouping: true,
      type: 'error',
      plain: true,
    })
  }
})

export async function $handleUserLogin(token: { accessToken: string, refreshToken: string }) {
  userStore.value.token = token

  await refreshCurrentUserRPM()
  await refreshUserSubscription()
  await refreshUserDummy()

  $event.emit('USER_LOGIN_SUCCESS')
}

export async function syncPilotAuthStatus() {
  try {
    const response = await $endApi.v1.auth.getAuthStatus() as {
      code: number
      data?: {
        isLogin?: boolean
        profile?: {
          nickname?: string
          avatar?: string
          roles?: any[]
          permissions?: string[]
        }
      }
    }
    const isLogin = Boolean(response?.code === 200 && response?.data?.isLogin)
    if (!isLogin) {
      userStore.value.isLogin = false
      return false
    }

    const profile = response.data?.profile || {}
    Object.assign(userStore.value, {
      ...userStore.value,
      isLogin: true,
      nickname: profile.nickname || userStore.value.nickname || 'Pilot User',
      avatar: profile.avatar || userStore.value.avatar || '',
      roles: Array.isArray(profile.roles) ? profile.roles : [],
      permissions: Array.isArray(profile.permissions) ? profile.permissions : [],
    })
    return true
  }
  catch {
    userStore.value.isLogin = false
    return false
  }
}

export async function refreshUserDummy() {
  const res = await $endApi.v1.account.getUserDummy()

  if (!res.data) {
    ElNotification({
      title: '用户信息获取失败',
      message: '您的信息获取失败，请联系管理员处理。',
      type: 'error',
      duration: 8000,
    })

    return
  }

  Object.assign(userStore.value, {
    ...userStore.value,
    dummy: reactive(res.data),
  })
}

export async function refreshUserSubscription() {
  const beforeHas = !!userStore.value.subscription
  userStore.value.subscription = undefined

  const { data } = await getUserSubscription()
  if (beforeHas && !data) {
    ElNotification({
      title: '订阅已过期',
      message: '您的订阅已过期，相关权益已自动取消。',
      type: 'warning',
      duration: 8000,
    })

    return
  }

  // userStore.value.subscription = reactive(data)
  Object.assign(userStore.value, {
    ...userStore.value,
    subscription: reactive(data),
  })

  const plan = userStore.value.subscription

  document.body.classList.remove('ULTIMATE', 'STANDARD', 'DEV')

  if (plan)
    document.body.classList.add(plan.type)
}

/**
 * RPM: Role Permission Menu
 */
export async function refreshCurrentUserRPM() {
  const res = await getAccountDetail()
  Object.assign(userStore.value, res.data)

  const permissions = await getPermissionList()
  userStore.value.permissions = permissions.data

  const config = (await $endApi.v1.account.getUserConfig()).data || {}

  const priConfig = JSON.parse(config.pri_info || '{}')

  Object.assign(userConfig.value.pri_info, toReactive(priConfig))
  Object.assign(userConfig.value.pub_info, toReactive(JSON.parse(config.pub_info || '{}')))

  if (!document.body.classList.contains('mobile')) {
    if (userStore.value.isLogin && !priConfig?.info?.tutorial)
      userConfig.value.pri_info.info.tutorial = false
  }
}

export function updateAccountDetail(obj: { nickname: string, avatar: string }) {
  return endHttp.put(`account/update`, obj)
}

export function userHavePermission(permission: string) {
  if (userStore.value.isAdmin)
    return true

  return userStore.value.permissions?.includes(permission)
}

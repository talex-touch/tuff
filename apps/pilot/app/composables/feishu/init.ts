import { feishuLogin } from '../api/auth'
import type { RouterTyped } from '#vue-router'

// 强制声明tt存在
declare global {
  interface Window {
    tt: any
    h5sdk: any
  }
}

/**
 * 以下几种情况需要授权code（均需满足在飞书打开）
 * 1.用户未登录
 * 2.用户登录管理后台
 * 3.用户使用敏感操作
 */
function authLogin() {
  if (!window.tt.requestAccess) {
    ElMessageBox.alert('请使用新版飞书客户端打开', '当前客户端版本过低', {
      confirmButtonText: '了解',
    })

    return
  }

  window.tt.requestAccess({
    // 网页应用 App ID
    appID: 'cli_a63b10f14db4d00d',
    scopeList: ['contact:user.phone:readonly'],
    success: async (res: any) => {
      // 用户授权后返回预授权码
      const { code } = res

      const result = await feishuLogin(code)

      $handleUserLogin(result.data)

      ElMessage.info('登录成功！')
    },
    fail: (error: any) => {
      // 需要额外根据errno判断是否为 客户端不支持requestAccess导致的失败
      const { errno, errString } = error

      ElMessageBox.alert(errString, `无法完成授权(${errno})`, {
        confirmButtonText: '了解',
      })
    },
  })
}

export default (router: RouterTyped) => {
  const vConsole = new window.VConsole()

  window.h5sdk.ready(async () => {
    if (userStore.value.isLogin) {
      await router.push('/admin')

      ElMessage.success('已通过风险环境异常检测')
    }
    else {
      await router.push('/chores/feishu/authorize')

      authLogin()
    }
  })
}

<script setup lang="ts">
import { ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { useAuth } from '~/modules/auth/useAuth'

const { isLoggedIn, isLoading, isAuthenticated, currentUser, login, logout } = useAuth()

const userInfo = ref(currentUser.value)

// 监听用户状态变化
watch(isLoggedIn, () => {
  userInfo.value = currentUser.value
})

async function handleLogin() {
  try {
    const result = await login({
      onSuccess: (user) => {
        toast.success('登录成功！')
        console.log('用户登录成功:', user)
      },
      onError: (error) => {
        toast.error(`登录失败: ${error.message || error}`)
        console.error('登录失败:', error)
      },
    })

    if (result.success) {
      userInfo.value = result.user
    }
  }
  catch (error) {
    console.error('登录过程出错:', error)
    toast.error('登录过程中发生错误')
  }
}

async function handleLogout() {
  try {
    await logout()
    userInfo.value = null
  }
  catch (error) {
    console.error('登出失败:', error)
    toast.error('登出失败')
  }
}
</script>

<template>
  <div class="login-test">
    <h2>登录测试</h2>

    <div class="status-section">
      <h3>当前状态</h3>
      <p>登录状态: {{ isLoggedIn ? '已登录' : '未登录' }}</p>
      <p>加载状态: {{ isLoading ? '加载中' : '已完成' }}</p>
      <p>认证状态: {{ isAuthenticated ? '已认证' : '未认证' }}</p>
      <p v-if="userInfo">
        用户信息: {{ JSON.stringify(userInfo) }}
      </p>
    </div>

    <div class="actions-section">
      <h3>操作</h3>
      <button :disabled="isLoading" @click="handleLogin">
        {{ isLoggedIn ? '重新登录' : '登录' }}
      </button>
      <button :disabled="!isLoggedIn || isLoading" @click="handleLogout">
        登出
      </button>
    </div>
  </div>
</template>

<style scoped>
.login-test {
  padding: 20px;
  max-width: 600px;
  margin: 0 auto;
}

.status-section,
.actions-section {
  margin-bottom: 20px;
  padding: 15px;
  border: 1px solid #ddd;
  border-radius: 8px;
}

button {
  margin-right: 10px;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

button:not(:disabled):hover {
  opacity: 0.8;
}
</style>

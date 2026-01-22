<script setup lang="ts">
import { useAuth } from '~/modules/auth/useAuth'

const { authState, isLoading, isAuthenticated, signIn, signOut, getDisplayName, getPrimaryEmail } =
  useAuth()
</script>

<template>
  <div class="clerk-test">
    <h2>Clerk 认证测试</h2>

    <div v-if="isLoading" class="loading">正在加载 Clerk...</div>

    <div v-else-if="isAuthenticated" class="authenticated">
      <h3>已登录</h3>
      <p>用户: {{ getDisplayName() }}</p>
      <p>邮箱: {{ getPrimaryEmail() }}</p>
      <p>会话ID: {{ authState.sessionId }}</p>

      <el-button type="danger" @click="signOut"> 登出 </el-button>
    </div>

    <div v-else class="not-authenticated">
      <h3>未登录</h3>
      <el-button type="primary" @click="signIn"> 登录 </el-button>
    </div>

    <div class="debug-info">
      <h4>调试信息</h4>
      <pre>{{ JSON.stringify(authState, null, 2) }}</pre>
    </div>
  </div>
</template>

<style scoped>
.clerk-test {
  padding: 20px;
  max-width: 600px;
  margin: 0 auto;
}

.loading {
  text-align: center;
  padding: 20px;
}

.authenticated,
.not-authenticated {
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin: 20px 0;
}

.debug-info {
  margin-top: 20px;
  padding: 15px;
  background-color: #f5f5f5;
  border-radius: 8px;
}

.debug-info pre {
  font-size: 12px;
  overflow-x: auto;
}
</style>

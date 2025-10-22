<template>
  <div class="clerk-login-dialog">
    <div class="clerk-login-header">
      <h2>登录到 TalexTouch</h2>
      <button class="close-btn" @click="handleClose">
        <i class="ri-close-line"></i>
      </button>
    </div>

    <div class="clerk-login-content">
      <div v-if="isLoading" class="loading-container">
        <div class="loading-spinner"></div>
        <p>正在加载...</p>
      </div>

      <div v-else-if="isAuthenticated" class="success-container">
        <div class="success-icon">
          <i class="ri-check-line"></i>
        </div>
        <h3>登录成功！</h3>
        <p>欢迎回来，{{ getDisplayName() }}！</p>
        <el-button type="primary" @click="handleSuccess">
          继续
        </el-button>
      </div>

      <div v-else class="login-options">
        <div class="login-methods">
          <el-button
            type="primary"
            size="large"
            :loading="isLoading"
            @click="handleSignIn"
            class="login-btn"
          >
            <i class="ri-login-box-line"></i>
            使用 Clerk 登录
          </el-button>

          <el-button
            type="default"
            size="large"
            :loading="isLoading"
            @click="handleSignUp"
            class="signup-btn"
          >
            <i class="ri-user-add-line"></i>
            注册新账户
          </el-button>
        </div>

        <div class="divider">
          <span>或</span>
        </div>

        <div class="alternative-login">
          <el-button
            type="default"
            size="large"
            @click="handleTraditionalLogin"
            class="traditional-btn"
          >
            <i class="ri-user-line"></i>
            使用传统登录
          </el-button>
        </div>
      </div>

      <div class="clerk-login-footer">
        <p class="privacy-note">
          登录即表示您同意我们的
          <a href="#" @click="showPrivacyPolicy">隐私政策</a>
          和
          <a href="#" @click="showTermsOfService">服务条款</a>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useClerkAuth } from '~/modules/auth/useClerkAuth'

const props = defineProps<{
  close: () => void
  onSuccess?: (user: any) => void
  onError?: (error: any) => void
}>()

const {
  isAuthenticated,
  isLoading,
  signIn,
  signUp,
  getDisplayName
} = useClerkAuth()

// 监听认证状态变化
watch(isAuthenticated, (authenticated) => {
  if (authenticated) {
    ElMessage.success('登录成功！')
  }
})

function handleClose() {
  props.close()
}

function handleSuccess() {
  const user = {
    id: getDisplayName(),
    name: getDisplayName(),
    provider: 'clerk'
  }
  props.onSuccess?.(user)
}

async function handleSignIn() {
  try {
    await signIn()
  } catch (error) {
    console.error('Clerk sign in failed:', error)
    ElMessage.error('登录失败，请重试')
    props.onError?.(error)
  }
}

async function handleSignUp() {
  try {
    await signUp()
  } catch (error) {
    console.error('Clerk sign up failed:', error)
    ElMessage.error('注册失败，请重试')
    props.onError?.(error)
  }
}

function handleTraditionalLogin() {
  // 切换到传统登录
  props.close()
  // 这里可以触发传统登录对话框
  window.dispatchEvent(new CustomEvent('open-traditional-login'))
}

function showPrivacyPolicy() {
  // 显示隐私政策
  console.log('Show privacy policy')
}

function showTermsOfService() {
  // 显示服务条款
  console.log('Show terms of service')
}
</script>

<style scoped>
.clerk-login-dialog {
  width: 100%;
  height: 100%;
  background: var(--el-bg-color);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.clerk-login-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--el-bg-color-page);
}

.clerk-login-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}

.clerk-login-content {
  flex: 1;
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.loading-container {
  text-align: center;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--el-border-color);
  border-top: 3px solid var(--el-color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.success-container {
  text-align: center;
}

.success-icon {
  width: 60px;
  height: 60px;
  background: var(--el-color-success-light-9);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
  font-size: 24px;
  color: var(--el-color-success);
}

.success-container h3 {
  margin: 0 0 8px 0;
  color: var(--el-text-color-primary);
}

.success-container p {
  margin: 0 0 24px 0;
  color: var(--el-text-color-regular);
}

.login-options {
  width: 100%;
}

.login-methods {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.login-btn,
.signup-btn,
.traditional-btn {
  width: 100%;
  height: 48px;
  font-size: 16px;
  font-weight: 500;
}

.login-btn i,
.signup-btn i,
.traditional-btn i {
  margin-right: 8px;
}

.divider {
  position: relative;
  text-align: center;
  margin: 24px 0;
}

.divider::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--el-border-color);
}

.divider span {
  background: var(--el-bg-color);
  padding: 0 16px;
  color: var(--el-text-color-regular);
  font-size: 14px;
}

.alternative-login {
  margin-top: 16px;
}

.clerk-login-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--el-border-color);
  background: var(--el-bg-color-page);
}

.privacy-note {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-regular);
  text-align: center;
  line-height: 1.4;
}

.privacy-note a {
  color: var(--el-color-primary);
  text-decoration: none;
}

.privacy-note a:hover {
  text-decoration: underline;
}
</style>

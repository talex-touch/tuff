# 优化的登录系统

本项目现在支持多种认证方式，包括 Clerk 认证和传统登录方式。

## 主要特性

- 🔐 **多种认证方式**: 支持 Clerk 认证和传统登录
- 🔄 **自动回退**: 支持自动选择最佳认证方式
- 🎨 **统一界面**: 提供一致的登录体验
- 📱 **响应式设计**: 适配不同屏幕尺寸
- 🔧 **高度可配置**: 支持自定义登录选项
- 🔄 **向后兼容**: 保持与现有代码的兼容性

## 快速开始

### 基本使用

```typescript
import { useLogin } from '~/modules/hooks/useLogin'

const {
  isLoggedIn,
  isLoading,
  login,
  logout,
  getCurrentUser
} = useLogin()

// 检查登录状态
if (isLoggedIn()) {
  console.log('用户已登录:', getCurrentUser())
}

// 执行登录
const result = await login({
  method: 'clerk', // 'clerk' | 'traditional' | 'auto'
  showDialog: true,
  onSuccess: (user) => {
    console.log('登录成功:', user)
  },
  onError: (error) => {
    console.error('登录失败:', error)
  }
})
```

### 认证方式

#### 1. Clerk 认证

```typescript
// 使用 Clerk 认证
const result = await login({
  method: 'clerk',
  showDialog: true
})
```

#### 2. 传统登录

```typescript
// 使用传统登录
const result = await login({
  method: 'traditional',
  showDialog: true
})
```

#### 3. 自动选择

```typescript
// 自动选择最佳认证方式（优先 Clerk）
const result = await login({
  method: 'auto',
  showDialog: true
})
```

### 无对话框登录

```typescript
// 直接执行登录，不显示对话框
const result = await login({
  method: 'clerk',
  showDialog: false
})
```

## API 参考

### useLogin(options?)

#### 参数

```typescript
interface LoginOptions {
  method?: 'clerk' | 'traditional' | 'auto'  // 认证方式
  showDialog?: boolean                        // 是否显示对话框
  onSuccess?: (user: any) => void            // 成功回调
  onError?: (error: any) => void             // 错误回调
  onCancel?: () => void                      // 取消回调
}
```

#### 返回值

```typescript
{
  // 状态
  isLoggedIn: () => boolean           // 是否已登录
  isLoading: Ref<boolean>             // 是否加载中
  isAuthenticated: Ref<boolean>       // Clerk 是否已认证

  // 用户信息
  getCurrentUser: () => User | null   // 获取当前用户

  // 登录/登出
  login: (options?) => Promise<LoginResult>  // 执行登录
  logout: () => Promise<void>                // 执行登出

  // Clerk 相关
  clerkSignIn: () => Promise<void>    // Clerk 登录
  clerkSignOut: () => Promise<void>   // Clerk 登出

  // 工具方法
  switchAuthMethod: (method) => void  // 切换认证方式
  createLoginDialog: (callback) => App  // 创建传统登录对话框
  createClerkLoginDialog: (callback) => App  // 创建 Clerk 登录对话框
}
```

### LoginResult

```typescript
interface LoginResult {
  success: boolean      // 是否成功
  user?: any           // 用户信息
  error?: any          // 错误信息
  method?: 'clerk' | 'traditional'  // 使用的认证方式
}
```

## 组件

### ClerkLoginDialog

Clerk 专用的登录对话框组件。

```vue
<template>
  <ClerkLoginDialog
    :close="handleClose"
    :on-success="handleSuccess"
    :on-error="handleError"
  />
</template>
```

### LoginTest

测试组件，展示各种登录方式的使用。

访问 `/test/login` 查看完整示例。

## 配置

### Clerk 配置

确保在 `.env` 文件中配置了 Clerk 密钥：

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your-key-here
```

### 环境变量

```env
# Clerk 认证配置
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your-publishable-key-here
VITE_CLERK_DOMAIN=your-domain.com

# 开发环境配置
NODE_ENV=development
```

## 使用示例

### 在组件中使用

```vue
<template>
  <div>
    <div v-if="isLoggedIn()">
      欢迎，{{ getCurrentUser()?.name }}！
      <el-button @click="handleLogout">登出</el-button>
    </div>
    <div v-else>
      <el-button @click="handleLogin" :loading="isLoading">
        登录
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { useLogin } from '~/modules/hooks/useLogin'

const {
  isLoggedIn,
  isLoading,
  getCurrentUser,
  login,
  logout
} = useLogin()

async function handleLogin() {
  try {
    const result = await login({
      method: 'auto',
      showDialog: true,
      onSuccess: (user) => {
        console.log('登录成功:', user)
      }
    })

    if (result.success) {
      console.log('用户信息:', result.user)
    }
  } catch (error) {
    console.error('登录失败:', error)
  }
}

async function handleLogout() {
  try {
    await logout()
    console.log('已登出')
  } catch (error) {
    console.error('登出失败:', error)
  }
}
</script>
```

### 在设置页面中使用

```vue
<template>
  <div class="user-settings">
    <div v-if="isLoggedIn()" class="user-info">
      <h3>账户信息</h3>
      <p>姓名: {{ getCurrentUser()?.name }}</p>
      <p>邮箱: {{ getCurrentUser()?.email }}</p>
      <p>认证方式: {{ getCurrentUser()?.provider }}</p>

      <el-button @click="handleLogout" type="danger">
        登出账户
      </el-button>
    </div>

    <div v-else class="login-prompt">
      <h3>请先登录</h3>
      <el-button @click="handleLogin" type="primary">
        立即登录
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { useLogin } from '~/modules/hooks/useLogin'

const {
  isLoggedIn,
  getCurrentUser,
  login,
  logout
} = useLogin()

async function handleLogin() {
  await login({
    method: 'auto',
    showDialog: true
  })
}

async function handleLogout() {
  await logout()
}
</script>
```

## 迁移指南

### 从旧版本迁移

如果您之前使用的是 `useLogin()` 函数，现在可以无缝迁移：

```typescript
// 旧方式（仍然支持）
import { useLogin } from '~/modules/hooks/function-hooks'

const app = useLogin() // 创建传统登录对话框

// 新方式（推荐）
import { useLogin } from '~/modules/hooks/useLogin'

const { login } = useLogin()
const result = await login({ method: 'traditional' })
```

### 更新现有代码

```typescript
// 旧代码
const app = useLogin()

// 新代码
const { createLoginDialog } = useLogin()
const app = createLoginDialog((result) => {
  console.log('登录结果:', result)
})
```

## 故障排除

### 常见问题

1. **Clerk 初始化失败**
   - 检查 `VITE_CLERK_PUBLISHABLE_KEY` 是否正确配置
   - 确保网络连接正常

2. **传统登录失败**
   - 检查后端 API 是否正常运行
   - 确认用户凭据是否正确

3. **对话框不显示**
   - 检查是否有其他对话框已打开
   - 确认 DOM 元素 ID 没有冲突

### 调试

使用测试组件进行调试：

```typescript
// 访问 /test/login 查看完整功能测试
```

## 更多信息

- [Clerk 官方文档](https://clerk.com/docs)
- [Vue 3 组合式 API](https://vuejs.org/guide/composition-api/)
- [Element Plus 组件库](https://element-plus.org/)

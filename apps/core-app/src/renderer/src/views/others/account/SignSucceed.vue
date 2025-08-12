<template>
  <!-- Sign Succeed View -->
  <div class="SignSucceed-Container">
    <div v-if="form()?.type === 'register'" class="SignSucceed-Register">
      <div class="SignSucceed-Register-Title">
        <p>注册成功!</p>
      </div>
      <div class="SignSucceed-Register-Content">
        <p>您的账号已经注册成功，我们已为您自动登录TalexTouch。</p>
      </div>
      <div class="SignSucceed-Register-Button">
        <FlatButton @click="close"> 开始使用 </FlatButton>
      </div>
    </div>
    <div v-else class="SignSucceed-Login">
      <div class="SignSucceed-Login-Title">
        <p>登录成功!</p>
      </div>
      <div class="SignSucceed-Login-Content">
        <p>您的账号已经登录成功，现在即可开始畅享TalexTouch。</p>
      </div>
      <div class="SignSucceed-Login-Button">
        <FlatButton @click="close"> 开始使用 </FlatButton>
      </div>
    </div>
  </div>
</template>

<script lang="ts" name="SignSucceedView" setup>
/**
 * Sign Succeed View Component
 *
 * This component displays a success message after user authentication.
 * It shows different messages for registration and login success.
 *
 * Features:
 * - Success message display
 * - Conditional rendering based on authentication type
 * - Navigation button to start using the application
 */

import { inject } from 'vue'
import FlatButton from '@comp/base/button/FlatButton.vue'
// import { $t } from "@modules/lang";

// Reactive references
const close: any = inject('close')
const form: any = inject('form')
</script>

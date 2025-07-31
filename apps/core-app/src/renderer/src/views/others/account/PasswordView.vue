<template>
  <!-- Password Input View -->
  <FlatInput v-model="value" icon="lock" password="true" @keydown.enter="next"> </FlatInput>
  <div style="display: flex; gap: 16px">
    <FlatButton @click="last">
      {{ $t('base.last_step') }}
    </FlatButton>
    <FlatButton @click="next">
      {{ $t('base.step') }}
    </FlatButton>
  </div>
</template>

<script lang="ts" name="PasswordView" setup>
/**
 * Password Input View Component
 *
 * This component handles the password input during user authentication.
 * It supports both login and registration flows, with appropriate validation
 * and navigation to the next step.
 *
 * Features:
 * - Password input field with masking
 * - Navigation buttons (previous/next)
 * - Integration with authentication APIs
 * - Support for both login and registration flows
 * - Error handling and user feedback
 */

import FlatInput from '@comp/base/input/FlatInput.vue'
import { inject, onMounted, ref } from 'vue'
import FlatButton from '@comp/base/button/FlatButton.vue'
// import { $t } from "@modules/lang";
import { useCaptcha } from '~/modules/hooks/api/useGeneralAPI'
import EmailVerifyView from '~/views/others/account/EmailVerifyView.vue'
import AccountView from '~/views/others/account/AccountView.vue'
import { useLogin, useRegisterVerification } from '~/modules/hooks/api/useAccount'
import SignSucceed from '~/views/others/account/SignSucceed.vue'

// Reactive references
const value = ref('')
const step: any = inject('step')
const form: any = inject('form')

/**
 * Setup component on mount
 * Initializes the password value from form data
 */
onMounted(() => {
  value.value = form().password
})

/**
 * Navigate to the previous step (account view)
 *
 * @returns void
 */
function last(): void {
  step(() => [{ pass: true, comp: AccountView }])
}

/**
 * Handle next step navigation
 * Processes either login or registration based on form type
 *
 * @returns Promise<void>
 */
async function next(): Promise<void> {
  // Show loading state
  step(() => [{ pass: false, loading: true }])

  // Extract form data
  const { type, email, username } = form()

  /**
   * Handle account verification for registration
   *
   * @param captcha - Captcha token for security
   * @returns Promise<void>
   */
  async function verifyAccount(captcha: string): Promise<void> {
    const password = value.value

    const res: any = await useRegisterVerification(captcha, email, username, password)

    if (res.data && res.code === 200) {
      step(() => [
        { pass: true, comp: EmailVerifyView },
        { password, hex: res.data }
      ])
    } else {
      step(() => [
        { pass: false, message: res.error.msg ? res.error.msg[0] : res.message },
        () => {
          step(() => [{ pass: true, comp: AccountView }])
        }
      ])
    }
  }

  /**
   * Handle account login
   *
   * @param captcha - Captcha token for security
   * @returns Promise<void>
   */
  async function loginAccount(captcha: string): Promise<void> {
    const password = value.value

    const res: any = await useLogin(captcha, username, password)

    if (res.data && res.code === 200) {
      // Login successful, update account storage
      window.$storage.account.analyzeFromObj(res.data)
      step(() => [{ pass: true, comp: SignSucceed }])
    } else {
      step(() => [
        { pass: false, message: res.error ? res.error : res.message },
        () => {
          step(() => [{ pass: true, comp: AccountView }])
        }
      ])
    }
  }

  // Use captcha and process authentication
  await useCaptcha((res: string) => {
    form().password = value.value

    if (type === 'login') {
      // Login logic
      loginAccount(res)
    } else {
      // Registration logic
      verifyAccount(res)
    }
  })
}
</script>

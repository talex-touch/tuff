<template>
  <!-- Email Input View -->
  <FlatInput v-model="value" icon="mail" @keydown.enter="next"> </FlatInput>
  <div style="display: flex; gap: 16px">
    <FlatButton @click="last">
      {{ $t('base.last_step') }}
    </FlatButton>
    <FlatButton @click="next">
      {{ $t('base.step') }}
    </FlatButton>
  </div>
</template>

<script lang="ts" name="EmailView" setup>
/**
 * Email Input View Component
 *
 * This component handles the email input during user registration.
 * It validates the email format and navigates to the next step, password input.
 *
 * Features:
 * - Email input field with validation
 * - Navigation buttons (previous/next)
 * - Email format validation using regex
 * - Integration with form data injection
 */

import FlatInput from '@comp/base/input/FlatInput.vue'
import { inject, onMounted, ref } from 'vue'
import FlatButton from '@comp/base/button/FlatButton.vue'
// import { $t } from "@modules/lang";
import AccountView from '~/views/others/account/AccountView.vue'
import PasswordView from '~/views/others/account/PasswordView.vue'

// Reactive references
const value = ref('')
const step: any = inject('step')
const form: any = inject('form')

/**
 * Setup component on mount
 * Initializes the email value from form data
 * Automatically navigates to password view if username is already an email
 */
onMounted(() => {
  value.value = form().email

  if (regx.test(form().username)) {
    step(() => [{ pass: true, comp: PasswordView }, { email: form().username }])
  }
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
 * Email validation regex
 * Matches standard email format
 */
const regx = /^[\w-]+(\.[\w-]+)*@[\w-]+(\.[\w-]+)+$/

/**
 * Handle next step navigation
 * Validates email format and navigates to password view
 *
 * @returns Promise<void>
 */
async function next(): Promise<void> {
  if (!value.value) {
    return step(() => [{ pass: false, message: '请输入邮箱!' }])
  }

  if (!regx.test(value.value)) {
    return step(() => [{ pass: false, message: '请输入正确的邮箱!' }])
  }

  step(() => [{ pass: true, comp: PasswordView }, { email: value.value }])
}
</script>

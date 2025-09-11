<template>
  <!-- Email Verification View -->
  <FlatCodeInput @input="inputDone" />
</template>

<script lang="ts" name="EmailVerifyView" setup>
/**
 * Email Verification View Component
 *
 * This component handles the email verification process during user registration.
 * It displays a code input field for the user to enter the verification code
 * sent to their email address.
 *
 * Features:
 * - Code input field for verification code
 * - Automatic submission when code is entered
 * - Integration with account registration API
 * - Error handling and navigation between views
 */

import { inject, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
// import { $t } from "@modules/lang";
import FlatCodeInput from '@comp/base/input/FlatCodeInput.vue'
import { forDialogMention } from '~/modules/mention/dialog-mention'
import { useRegister } from '~/modules/hooks/api/useAccount'
import { useCaptcha } from '~/modules/hooks/api/useGeneralAPI'
import AccountView from '~/views/others/account/AccountView.vue'
import SignSucceed from '~/views/others/account/SignSucceed.vue'

const { t } = useI18n()

// Reactive references
const step: any = inject('step')
const form: any = inject('form')

/**
 * Setup dialog mention on component mount
 * Displays instructions to the user about email verification
 */
onMounted(() => {
  forDialogMention(
    t('emailVerify.title'),
    t('emailVerify.content'),
    '#error-warning'
  )
})

/**
 * Handle code input completion
 *
 * @param code - The verification code entered by the user
 */
async function inputDone(code: string): Promise<void> {
  // Show loading state
  step(() => [{ pass: false, loading: true }])

  // Use captcha and register user
  await useCaptcha(async (captcha) => {
    const res: any = await useRegister(captcha, code, form().hex)

    if (res.data && res.code === 200) {
      // Registration successful, update account storage
      window.$storage.account.analyzeFromObj(res.data)
      step(() => [{ pass: true, comp: SignSucceed }])
    } else {
      // Registration failed, show error and return to account view
      step(() => [
        { pass: false, message: res.error?.msg ? res.error.msg[0] : res.message },
        () => {
          step(() => [{ pass: true, comp: AccountView }])
        }
      ])
    }
  })
}
</script>

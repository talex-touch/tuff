<template>
  <!-- Sign Succeed View -->
  <div class="SignSucceed-Container">
    <div v-if="form()?.type === 'register'" class="SignSucceed-Register">
      <div class="SignSucceed-Register-Title">
        <p>{{ t('signSucceed.registerTitle') }}</p>
      </div>
      <div class="SignSucceed-Register-Content">
        <p>{{ t('signSucceed.registerContent') }}</p>
      </div>
      <div class="SignSucceed-Register-Button">
        <FlatButton @click="close"> {{ t('signSucceed.startButton') }} </FlatButton>
      </div>
    </div>
    <div v-else class="SignSucceed-Login">
      <div class="SignSucceed-Login-Title">
        <p>{{ t('signSucceed.loginTitle') }}</p>
      </div>
      <div class="SignSucceed-Login-Content">
        <p>{{ t('signSucceed.loginContent') }}</p>
      </div>
      <div class="SignSucceed-Login-Button">
        <FlatButton @click="close"> {{ t('signSucceed.startButton') }} </FlatButton>
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
import { useI18n } from 'vue-i18n'
import FlatButton from '@comp/base/button/FlatButton.vue'
// import { $t } from "@modules/lang";

const { t } = useI18n()

// Reactive references
const close: any = inject('close')
const form: any = inject('form')
</script>

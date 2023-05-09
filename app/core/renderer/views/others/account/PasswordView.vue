<template>
  <FlatInput @keydown.enter="next" v-model="value" icon="lock" password="true">

  </FlatInput>
  <div style="display: flex;gap: 16px">
    <FlatButton @click="last">
      {{ $t('base.last_step') }}
    </FlatButton>
    <FlatButton @click="next">
      {{ $t('base.step') }}
    </FlatButton>
  </div>
</template>

<script>
export default {
  name: "PasswordView"
}
</script>

<script setup>
import FlatInput from "@comp/base/input/FlatInput.vue";
import { inject, onMounted, ref } from "vue";
import FlatButton from "@comp/base/button//FlatButton.vue";
import { $t } from "@modules/lang";
import { useCaptcha } from "@modules/hooks/api/useGeneralAPI";
import EmailVerifyView from "~/views/others/account/EmailVerifyView.vue";
import AccountView from "~/views/others/account/AccountView.vue";
import { useLogin, useRegisterVerification } from "@modules/hooks/api/useAccount";
import SignSucceed from "~/views/others/account/SignSucceed.vue";

const value = ref("")
const step = inject('step')
const form = inject('form')

onMounted(() => {
  value.value = form().password
})

function last() {
  step(() => [{ pass: true, comp: AccountView }])
}

async function next() {

  step(() => [{ pass: false, loading: true }])

  const { type, email, username } = form()

  async function verifyAccount(captcha) {
    const password = value.value

    const res = await useRegisterVerification( captcha, email, username, password )

    if ( res.data && res.code === 200 ) {
      step(() => [{ pass: true, comp: EmailVerifyView }, { password, hex: res.data }])
    } else {
      step(() => [{ pass: false, message: res.error.msg ? res.error.msg[0] : res.message }, () => {
        step(() => [{ pass: true, comp: AccountView }])
      }])
    }

  }

  async function loginAccount(captcha) {
    const password = value.value

    const res = await useLogin( captcha, username, password )

    if ( res.data && res.code === 200 ) {
      window.$storage.account.analyzeFromObj(res.data)

      step(() => [{ pass: true, comp: SignSucceed }])
    } else {
      step(() => [{ pass: false, message: res.error ? res.error : res.message }, () => {
        step(() => [{ pass: true, comp: AccountView }])
      }])
    }

  }

  await useCaptcha((res) => {
    form().password = value.value

    if ( type === 'login' ) {
      // login logic
      loginAccount(res)
    } else {
      verifyAccount(res)
    }

    // step(() => [{ pass: true, comp: EmailVerifyView }, { password: value.value }]) // TODO: md5
  })



}
</script>
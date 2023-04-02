<template>
  <FlatCodeInput @input="inputDone" />
</template>

<script>
export default {
  name: "EmailVerifyView"
}
</script>

<script setup>
import { inject, onMounted, ref } from "vue";
import FlatButton from "@comp/button/FlatButton.vue";
import { $t } from "@modules/lang";
import FlatCodeInput from "@comp/input/FlatCodeInput.vue";
import { forDialogMention } from "@modules/mention/dialog-mention";
import { useRegister } from "@modules/hooks/api/useAccount";
import { useCaptcha } from "@modules/hooks/api/useGeneralAPI";
import AccountView from "~/views/others/account/AccountView.vue";
import SignSucceed from "~/views/others/account/SignSucceed.vue";

const value = ref("")
const step = inject('step')
const form = inject('form')

onMounted(() => {
  forDialogMention('验证邮箱', '我们已经向您的邮箱发送了一封验证邮件，请输入邮箱验证码。', '#error-warning')
})

async function inputDone(code) {
  step(() => [ { pass: false, loading: true } ])

  await useCaptcha(async (captcha) => {

    const res = await useRegister(captcha, +code, form().hex)

    if ( res.data && res.code === 200 ) {
      window.$storage.account.analyzeFromObj(res.data)

      step(() => [{ pass: true, comp: SignSucceed }])
    } else {
      step(() => [{ pass: false, message: res.error?.msg ? res.error.msg[0] : res.message }, () => {
        step(() => [{ pass: true, comp: AccountView }])
      }])
    }
  })


}

</script>
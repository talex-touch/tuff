<template>
    <FlatInput @keydown.enter="next" v-model="value" icon="user">

    </FlatInput>
    <FlatButton @click="next">
        {{ $t('base.step') }}
    </FlatButton>
</template>

<script>
export default {
  name: "AccountView"
}
</script>

<script setup>
import FlatInput from "@comp/base/input/FlatInput.vue";
import { inject, onMounted, ref } from "vue";
import FlatButton from "@comp/base/button//FlatButton.vue";
import { $t } from "@modules/lang";
import PasswordView from "~/views/others/account/PasswordView.vue";
import { useUserExists } from "@modules/hooks/api/useAccount";
import EmailView from "~/views/others/account/EmailView.vue";

const value = ref("")
const step = inject('step')
const form = inject('form')

onMounted(() => {
  value.value = form().username
})

async function next() {
  if ( !value.value ) {
    return step(() => [{ pass: false, message: "请输入账号!" }])
  }

  step(() => [{ pass: false, loading: true }])

  const res = await useUserExists(value.value)

  if ( res.code === 500 ) {
    return step(() => [{ pass: false, message: "无法连接至远程服务器!" }])
  }

  if ( res.code === 200 ) {
    step(() => [{ pass: true, comp: PasswordView }, { type: 'login', username: value.value }])
  } else {
    step(() => [{ pass: true, comp: EmailView }, { type: 'register', username: value.value }])
  }
}
</script>
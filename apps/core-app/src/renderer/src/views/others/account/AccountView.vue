<template>
  <FlatInput
    placeholder="Your account here"
    @keydown.enter="next"
    v-model="value"
    icon="user"
  >
  </FlatInput>
  <br />
  <FlatButton @click="next"> Next </FlatButton>
</template>

<script lang="ts" name="AccountView" setup>
import FlatInput from "@comp/base/input/FlatInput.vue";
import { inject, onMounted, ref } from "vue";
import FlatButton from "@comp/base/button//FlatButton.vue";
import PasswordView from "~/views/others/account/PasswordView.vue";
import { useUserExists } from "~/modules/hooks/api/useAccount";
import EmailView from "~/views/others/account/EmailView.vue";

const value = ref("");
const step: any = inject("step");
const form: any = inject("form");

onMounted(() => {
  value.value = form().username;
});

async function next() {
  if (!value.value) {
    return step(() => [{ pass: false, message: "请输入账号!" }]);
  }

  step(() => [{ pass: false, loading: true }]);

  const res: any = await useUserExists(value.value);

  if (res.code === 500) {
    return step(() => [{ pass: false, message: "无法连接至远程服务器!" }]);
  }

  if (res.code === 200) {
    step(() => [
      { pass: true, comp: PasswordView },
      { type: "login", username: value.value },
    ]);
  } else {
    step(() => [
      { pass: true, comp: EmailView },
      { type: "register", username: value.value },
    ]);
  }
}
</script>

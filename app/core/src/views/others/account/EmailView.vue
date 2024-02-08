<template>
  <FlatInput @keydown.enter="next" v-model="value" icon="mail"> </FlatInput>
  <div style="display: flex; gap: 16px">
    <FlatButton @click="last">
      {{ $t("base.last_step") }}
    </FlatButton>
    <FlatButton @click="next">
      {{ $t("base.step") }}
    </FlatButton>
  </div>
</template>

<script>
export default {
  name: "EmaildView",
};
</script>

<script lang="ts" setup>
import FlatInput from "@comp/base/input/FlatInput.vue";
import { inject, onMounted, ref } from "vue";
import FlatButton from "@comp/base/button//FlatButton.vue";
import { $t } from "@modules/lang";
import AccountView from "~/views/others/account/AccountView.vue";
import PasswordView from "~/views/others/account/PasswordView.vue";

const value = ref("");
const step = inject("step");
const form = inject("form");

onMounted(() => {
  value.value = form().email;

  if (regx.test(form().username)) {
    step(() => [{ pass: true, comp: PasswordView }, { email: form().username }]);
  }
});

function last() {
  step(() => [{ pass: true, comp: AccountView }]);
}

const regx = /^[\w-]+(\.[\w-]+)*@[\w-]+(\.[\w-]+)+$/;

async function next() {
  if (!value.value) {
    return step(() => [{ pass: false, message: "请输入邮箱!" }]);
  }

  if (!regx.test(value.value)) {
    return step(() => [{ pass: false, message: "请输入正确的邮箱!" }]);
  }

  step(() => [{ pass: true, comp: PasswordView }, { email: value.value }]);
}
</script>

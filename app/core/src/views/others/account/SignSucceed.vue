<template>
  <div class="SignSucceed-Container">
    <div class="SignSucceed-Register" v-if="form()?.type === 'register'">
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
    <div class="SignSucceed-Login" v-else>
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

<script>
export default {
  name: "SignSucceedView",
};
</script>

<script lang="ts" setup>
import { inject, onMounted, ref } from "vue";
import FlatButton from "@comp/base/button//FlatButton.vue";
import { $t } from "@modules/lang";

const value = ref("");
const close = inject("close");
const form = inject("form");
</script>

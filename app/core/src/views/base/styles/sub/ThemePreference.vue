<script setup lang="ts" name="ThemePreference">
import FormTemplate from '@comp/base/template/FormTemplate.vue'
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <FormTemplate contentStyle="width: calc(100% - 5rem);height: calc(100% - 10rem)" class="ThemePreference-Container">
    <template #header>
      <div items-center flex>
        <div p-2 @click="() => $router.back()"
          class="i-ri-arrow-left-s-line hover-button fake-background transition-cubic" />
        <p my-4 font-extrabold text-2xl v-shared-element:[`theme-preference-${route.query.theme}`]>{{ route.query.theme }}</p>
      </div>
    </template>

    <div class="ThemePreference-Content">
      <div class="ThemePreference-Display" :class="route.query.theme" v-shared-element:[`theme-preference-${route.query.theme}-img`]>

      </div>
    </div>
  </FormTemplate>
</template>

<style lang="scss">
.ThemePreference-Content, .ThemePreference-Display {
  position: relative;

  width: 100%;
  height: 100%;
  .ThemePreference-Display {
    background-size: 100% 100%;
    background-repeat: no-repeat;
    background-image: url("@assets/bg/apparent.jpg");
  }
}
</style>
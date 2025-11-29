<script lang="ts" setup>
import Logo from '/images/logo.svg'
import DefaultTheme from 'vitepress/theme'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #nav-bar-title-before>
      <img width="32" :src="Logo" alt="logo" />
    </template>
    <template #nav-bar-title-after>
      <span class="beta-tag">BETA</span>
    </template>
  </Layout>
</template>

<style lang="scss" scoped>
.beta-tag {
  margin: 0 0.5rem;
  padding: 4px 8px;
  color: #F29C39 !important;

  font-weight: bold;
  border-radius: 12px;
  background-color: #191919;
}
</style>

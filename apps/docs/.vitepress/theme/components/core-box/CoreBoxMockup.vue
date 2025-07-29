<script setup lang="ts">
import { onMounted } from "vue";
import Logo from "../base/Logo.vue";
import TypeIt from 'typeit'

onMounted(() => {
  new TypeIt('#input', {
    strings: [
      'Summarize what I wrote these days in WPS...',
      'Translate this article into English.',
      'Generate a summary of the article.',
      'Memorize these files.',
      'Open clipboard',
      'Analyze and extract key insights from this document...',
      'Convert this text to a professional report format.',
      'Create a mind map from these notes.',
      'Generate code snippets based on this description.',
      'Perform sentiment analysis on this feedback.',
      'Extract and organize references from this research paper.',
      'Transform this data into an interactive visualization.'
    ],
    speed: 25,
    deleteSpeed: 20,
    nextStringDelay: 2000,
    loop: true,
    breakLines: false
  }).go()
})
</script>

<template>
  <div class="CoreBoxMockup">
    <div class="CoreBoxMockup-Logo">
      <Logo />
    </div>
    <div class="CoreBoxMockup-Input">
      <input id="input" placeholder="Type what you want to search by talex-touch." />
    </div>
    <div class="CoreBoxMockup-Suffix">
      <i />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.CoreBoxMockup {
  padding: 0 0.25rem;
  display: flex;
  width: 70%;
  min-width: 40vw;
  height: 60px;

  align-items: center;

  gap: 0.25rem;
  border-radius: 18px;
  border: 1px solid #484848;
  background-color: #212121a0;
  backdrop-filter: blur(18px) saturate(180%);
}

.CoreBoxMockup-Suffix {
  display: flex;

  width: 52px;
  height: 52px;

  font-size: 22px;

  align-items: center;
  justify-content: center;
}

.CoreBoxMockup-Suffix i {
  display: block;
  --un-icon: url("data:image/svg+xml;utf8,%3Csvg viewBox='0 0 24 24' width='1em' height='1em' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='currentColor' d='M18 3v2h-1v6l2 3v2h-6v7h-2v-7H5v-2l2-3V5H6V3z'/%3E%3C/svg%3E");

  -webkit-mask: var(--un-icon) no-repeat;
  mask: var(--un-icon) no-repeat;
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  background-color: currentColor;
  color: inherit;
  width: 1em;
  height: 1em;
}

.CoreBoxMockup-Logo {
  width: 52px;
  height: 52px;
}

.CoreBoxMockup-Input {
  flex: 1;
  height: 100%;
  input, p {
    width: 100%;
    height: 100%;

    outline: none;
    border: none;
    background-color: transparent;

    color: #fff !important;
    font-size: 22px;

    &::placeholder {
      color: #888888 !important;
    }
  }
}
</style>

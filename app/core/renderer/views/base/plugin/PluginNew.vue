<script setup name="PluginNew" lang="ts">
import FormTemplate from '@comp/base/template/FormTemplate.vue';
import BlockTemplate from '@comp/base/template/BlockTemplate.vue';
import BrickTemplate from '@comp/base/template/BrickTemplate.vue';
import FlatButton from '@comp/base/button/FlatButton.vue'
</script>

<template>
  <FormTemplate title="New Pluin" description="Create a new plugin.">
    <BlockTemplate title="Templates">
      <BrickTemplate>
        <p>
          <div inline-block mr-2 class="i-simple-icons-vuedotjs" />
        </p>
        <span block text-xs>
          Contains default dev-env, with using Vue3 and Vite.
        </span>
        <button text-xs cursor-pointer bg-transparent class="color-template fake-background" border-solid border rounded
          px-2 py-1 my-2>Download</button>
      </BrickTemplate>
      <BrickTemplate>
        <p>
          <div inline-block mr-2 class="i-simple-icons-react" />
        </p>
        <span block text-xs>
          Contains default dev-env, with using React18 and Vite.
        </span>
        <button text-xs cursor-pointer bg-transparent class="color-template fake-background" border-solid border rounded
          px-2 py-1 my-2>Download</button>
      </BrickTemplate>
      <BrickTemplate>
  <p>
            <div inline-block mr-2 class="i-simple-icons-svelte" />
          </p>
          <span block text-xs>
            Contains default dev-env, with using Svelte3 and Vite.
          </span>
          <button text-xs cursor-pointer bg-transparent class="color-template fake-background" border-solid border rounded
            px-2 py-1 my-2>Download</button>
      </BrickTemplate>
    </BlockTemplate>

    <BlockTemplate title="General">

    </BlockTemplate>
    <BlockTemplate title="Actions">
      <div relative mt-8 flex gap-4 w-4>
        <FlatButton hover:bg-red>
          Cancel
        </FlatButton>
        <FlatButton :primary="true">
          Create
        </FlatButton>
      </div>

    </BlockTemplate>
  </FormTemplate>
</template>

<style scoped lang="scss"></style>
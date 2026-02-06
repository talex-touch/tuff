<script setup lang="ts">
const name = ref('')

const router = useRouter()
function go() {
  if (name.value)
    router.push(`/hi/${encodeURIComponent(name.value)}`)
}
</script>

<template>
  <div>
    <TuffInput
      id="input"
      v-model="name"
      placeholder="What's your name?"
      autocomplete="off"
      class="mt-5 w-[250px] text-center"
      @keydown.enter="go"
    />
    <div>
      <TxButton class="mt-3" size="small" :disabled="!name" @click="go">
        GO
      </TxButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from '~/components/ui/Button.vue'
import Input from '~/components/ui/Input.vue'
const name = ref('')

const router = useRouter()
function go() {
  if (name.value)
    router.push(`/hi/${encodeURIComponent(name.value)}`)
}
</script>

<template>
  <div>
    <Input
      id="input"
      v-model="name"
      placeholder="What's your name?"
      type="text"
      autocomplete="off"
      class="mt-5 w-[250px] text-center"
      @keydown.enter="go"
    />
    <div>
      <Button
        variant="primary"
        size="small"
        class="m-3"
        :disabled="!name"
        @click="go"
      >
        GO
      </Button>
    </div>
  </div>
</template>

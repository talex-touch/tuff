<script lang="ts" name="OSIcon" setup>
const props = defineProps({
  os: {
    type: String,
    required: true
  }
})

const _class = ref()

watchEffect(() => {
  const { os } = props
  if (os === 'Windows 10 Pro' || os === 'win') {
    _class.value = 'Windows_11'
  } else if (os.indexOf('Windows') !== -1) {
    _class.value = 'i-ri-windows-line'
  } else if (os.indexOf('macOS') !== -1 || os === 'darwin') {
    _class.value = 'i-ri-apple-fill'
  } else if (os.indexOf('OS X') !== -1) {
    _class.value = 'i-ri-apple-line'
  } else if (os.indexOf('Kali') !== -1) {
    _class.value = 'i-simple-icons-kalilinux'
  } else if (os.indexOf('Linux') !== -1 || os === 'linux') {
    _class.value = 'i-simple-icons-linux'
  } else if (os.indexOf('Ubuntu') !== -1) {
    _class.value = 'i-simple-icons-ubuntu'
  } else if (os.indexOf('Debian') !== -1) {
    _class.value = 'i-simple-icons-debian'
  } else if (os.indexOf('Fedora') !== -1) {
    _class.value = 'i-simple-icons-fedora'
  } else if (os.indexOf('Arch') !== -1) {
    _class.value = 'i-simple-icons-archlinux'
  } else if (os.indexOf('Chromium') !== -1) {
    _class.value = 'i-ri-chrome-line'
  }
})
</script>

<template>
  <span :class="_class" />
</template>

<style>
.Windows_11 {
  margin-right: .25rem;

  width: 1rem;
  height: 1rem;

  background-size: 1rem 1rem;
  background-repeat: no-repeat;
  background-position: center;
  background-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjU2IDI1NiI+PHBhdGggZmlsbD0iIzAwNzhENCIgZD0iTTAgMGgxMjEuMzI5djEyMS4zMjlIMFYwWm0xMzQuNjcxIDBIMjU2djEyMS4zMjlIMTM0LjY3MVYwWk0wIDEzNC42NzFoMTIxLjMyOVYyNTZIMFYxMzQuNjcxWm0xMzQuNjcxIDBIMjU2VjI1NkgxMzQuNjcxVjEzNC42NzFaIi8+PC9zdmc+");
}
</style>
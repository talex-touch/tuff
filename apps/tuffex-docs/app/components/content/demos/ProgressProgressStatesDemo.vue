<template>
  <div style="display: grid; gap: 10px;">
    <TuffProgress :percentage="40" />
    <TuffProgress :percentage="72" status="warning" />
    <TuffProgress :percentage="100" status="success" />
  </div>
</template>

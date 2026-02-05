<template>
  <div class="tuff-demo-row">
    <TxButton variant="primary" vibrate-type="light">
轻微震动
</TxButton>
    <TxButton variant="primary" vibrate-type="medium">
中等震动
</TxButton>
    <TxButton variant="primary" vibrate-type="heavy">
重度震动
</TxButton>
    <TxButton variant="danger" vibrate-type="error">
错误震动
</TxButton>
    <TxButton variant="secondary" :vibrate="false">
无震动
</TxButton>
  </div>
</template>

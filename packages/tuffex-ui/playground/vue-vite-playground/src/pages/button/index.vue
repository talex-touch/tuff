<script setup lang="ts">
import { ref } from 'vue'

const loading = ref(false)

const handleClick = () => {
  console.log('Button clicked!')
  loading.value = true
  setTimeout(() => {
    loading.value = false
  }, 2000)
}
</script>

<template>
  <div style="padding: 20px; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); min-height: 100vh;">
    <div style="max-width: 1200px; margin: 0 auto;">
      <h1 style="text-align: center; color: #2c3e50; margin-bottom: 40px;">TouchX UI Button 组件展示</h1>

      <h2>基础用法 - 镂空透明效果</h2>
      <div class="group">
        <div class="demo-description">
          ✨ 全新设计：透明背景 + 底部 2px 粗边框，悬停时有轻微背景色和边框颜色变化
        </div>
        <TxButton>默认按钮</TxButton>
        <TxButton type="primary">主要按钮</TxButton>
        <TxButton type="success">成功按钮</TxButton>
        <TxButton type="info">信息按钮</TxButton>
        <TxButton type="warning">警告按钮</TxButton>
        <TxButton type="danger">危险按钮</TxButton>
      </div>

    <h2>禁用状态</h2>
    <div class="group">
      <TxButton disabled>默认按钮</TxButton>
      <TxButton type="primary" disabled>主要按钮</TxButton>
      <TxButton type="success" disabled>成功按钮</TxButton>
      <TxButton type="info" disabled>信息按钮</TxButton>
      <TxButton type="warning" disabled>警告按钮</TxButton>
      <TxButton type="danger" disabled>危险按钮</TxButton>
    </div>

    <h2>文字按钮</h2>
    <div class="group">
      <div class="demo-description">
        📝 文字按钮：无边框，悬停时底部出现淡色下划线效果
      </div>
      <TxButton type="text">文字按钮</TxButton>
      <TxButton type="text" disabled>禁用文字按钮</TxButton>
    </div>

    <h2>朴素按钮</h2>
    <div class="group">
      <div class="demo-description">
        🎨 朴素按钮：带有轻微背景色的镂空效果，悬停时背景色加深，底部边框颜色变化
      </div>
      <TxButton plain>朴素按钮</TxButton>
      <TxButton type="primary" plain>主要按钮</TxButton>
      <TxButton type="success" plain>成功按钮</TxButton>
      <TxButton type="info" plain>信息按钮</TxButton>
      <TxButton type="warning" plain>警告按钮</TxButton>
      <TxButton type="danger" plain>危险按钮</TxButton>
    </div>

    <h2>圆角按钮</h2>
    <div class="group">
      <TxButton round>圆角按钮</TxButton>
      <TxButton type="primary" round>主要按钮</TxButton>
      <TxButton type="success" round>成功按钮</TxButton>
      <TxButton type="info" round>信息按钮</TxButton>
      <TxButton type="warning" round>警告按钮</TxButton>
      <TxButton type="danger" round>危险按钮</TxButton>
    </div>

    <h2>图标按钮</h2>
    <div class="group">
      <TxButton type="primary" icon="edit" circle></TxButton>
      <TxButton type="primary" icon="share" circle></TxButton>
      <TxButton type="primary" icon="delete" circle></TxButton>
      <TxButton type="primary" icon="search">搜索</TxButton>
    </div>

    <h2>加载中</h2>
    <div class="group">
      <TxButton type="primary" :loading="loading" @click="handleClick">
        {{ loading ? '加载中' : '点击加载' }}
      </TxButton>
      <TxButton type="primary" loading></TxButton>
    </div>

    <h2>不同尺寸</h2>
    <div class="group">
      <TxButton size="large">大型按钮</TxButton>
      <TxButton>默认按钮</TxButton>
      <TxButton size="small">小型按钮</TxButton>
      <TxButton size="mini">超小按钮</TxButton>
    </div>

    <h2>震动反馈</h2>
    <div class="group">
      <TxButton type="primary" vibrate-type="light">轻微震动</TxButton>
      <TxButton type="primary" vibrate-type="medium">中等震动</TxButton>
      <TxButton type="primary" vibrate-type="heavy">重度震动</TxButton>
      <TxButton type="success" vibrate-type="success">成功震动</TxButton>
      <TxButton type="warning" vibrate-type="warning">警告震动</TxButton>
      <TxButton type="danger" vibrate-type="error">错误震动</TxButton>
      <TxButton type="info" :vibrate="false">无震动</TxButton>
    </div>
    </div>
  </div>
</template>

<style scoped>
h2 {
  margin: 30px 0 15px 0;
  color: #2c3e50;
  font-weight: 600;
  border-left: 4px solid #409eff;
  padding-left: 12px;
}

.group {
  margin-bottom: 30px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 12px;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

/* 添加一些说明文字样式 */
.demo-description {
  color: #666;
  font-size: 14px;
  margin-bottom: 15px;
  line-height: 1.5;
}
</style>

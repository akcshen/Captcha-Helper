<script setup>
import { onMounted, ref } from 'vue';
import { getSettings } from '../../lib/storage.js';

const apiUrl = ref('-');
const lastResult = ref('');
const lastRawResult = ref('');

onMounted(async () => {
  const settings = await getSettings();
  apiUrl.value = settings.apiUrl || '-';
  lastResult.value = settings.lastResult || '';
  lastRawResult.value = settings.lastRawResult || '';
});

function openOptions() {
  browser.runtime.openOptionsPage();
}
</script>

<template>
  <div class="popup">
    <h1>算术验证码助手</h1>
    <p class="row muted">{{ apiUrl }}</p>
    <p v-if="lastRawResult" class="row">API 原始：<strong>{{ lastRawResult }}</strong></p>
    <p v-if="lastResult" class="row">计算结果：<strong>{{ lastResult }}</strong></p>
    <p class="tip">右键验证码图片 →「识别并填入计算结果」</p>
    <el-button type="primary" style="width: 100%" @click="openOptions">打开设置</el-button>
  </div>
</template>

<style scoped>
.popup {
  width: 280px;
  padding: 14px;
  font-family: "PingFang SC", "Segoe UI", sans-serif;
}
h1 {
  margin: 0 0 8px;
  font-size: 15px;
}
.row {
  margin: 0 0 8px;
  font-size: 13px;
}
.muted {
  color: #6b7280;
  word-break: break-all;
  font-size: 12px;
}
.tip {
  margin: 0 0 12px;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.4;
}
</style>

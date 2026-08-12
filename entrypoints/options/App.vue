<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '../../lib/storage.js';

const loading = ref(false);
const saving = ref(false);
const testing = ref(false);
const testResult = ref('');
const testRaw = ref('');
const testApiPayload = ref('');
const form = reactive(structuredClone(DEFAULT_SETTINGS));

onMounted(async () => {
  loading.value = true;
  try {
    Object.assign(form, await getSettings());
  } finally {
    loading.value = false;
  }
});

async function handleSave() {
  saving.value = true;
  try {
    let apiUrl = form.apiUrl.trim().replace(/\/+$/, '');
    // 统一到官方 /ocr（旧 calculate / classification 自动纠正）
    if (/\/calculate$/i.test(apiUrl)) {
      apiUrl = apiUrl.replace(/\/calculate$/i, '/ocr');
      form.apiUrl = apiUrl;
    } else if (/\/classification$/i.test(apiUrl)) {
      apiUrl = apiUrl.replace(/\/classification$/i, '/ocr');
      form.apiUrl = apiUrl;
    }
    await saveSettings({
      apiUrl,
      headersJson: form.headersJson,
      timeoutMs: Number(form.timeoutMs) || 30000,
    });
    ElMessage.success('已保存');
  } catch (err) {
    ElMessage.error(err?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

/**
 * @param {File} file
 */
async function handleTest(file) {
  if (!file) return;
  testing.value = true;
  testResult.value = '';
  testRaw.value = '';
  testApiPayload.value = '';
  try {
    await handleSave();
    const dataUrl = await fileToPngDataUrl(file);
    const result = await browser.runtime.sendMessage({
      type: 'RECOGNIZE_DATA_URL',
      dataUrl,
    });
    if (!result?.ok) throw new Error(result?.error || '识别失败');
    testResult.value = result.text || '（空）';
    testRaw.value = result.raw || '（空）';
    testApiPayload.value = result.apiPayload
      ? JSON.stringify(result.apiPayload, null, 2)
      : '';
    ElMessage.success('测试完成');
  } catch (err) {
    ElMessage.error(err?.message || '测试失败');
  } finally {
    testing.value = false;
  }
}

/**
 * @param {File} file
 */
async function fileToPngDataUrl(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const mime = sniffMime(bytes) || file.type || 'image/jpeg';
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const src = `data:${mime};base64,${btoa(binary)}`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('无法创建画布'));
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('图片无法解码'));
    img.src = src;
  });
}

/**
 * @param {Uint8Array} bytes
 */
function sniffMime(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  return '';
}

function onFileChange(uploadFile) {
  if (uploadFile?.raw) handleTest(uploadFile.raw);
}
</script>

<template>
  <div class="page" v-loading="loading">
    <header class="header">
      <h1>算术验证码助手</h1>
      <p>右键验证码图 → 调用自建 API → 填入计算结果（如 <code>6+2=?</code> → <code>8</code>）</p>
    </header>

    <el-form label-width="110px" class="form">
      <el-form-item label="API URL">
        <el-input v-model="form.apiUrl" placeholder="https://ocr.kcshen.cn/ocr" />
      </el-form-item>
      <el-form-item label="Headers">
        <el-input
          v-model="form.headersJson"
          type="textarea"
          :rows="2"
          placeholder='可选 {"Authorization":"Bearer xxx"}'
        />
      </el-form-item>
      <el-form-item label="超时(ms)">
        <el-input-number v-model="form.timeoutMs" :min="3000" :max="120000" :step="1000" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </el-form-item>

      <el-divider>测试</el-divider>
      <el-form-item label="样例图">
        <el-upload :auto-upload="false" :show-file-list="false" accept="image/*" :on-change="onFileChange">
          <el-button :loading="testing">上传并识别</el-button>
        </el-upload>
      </el-form-item>
      <el-form-item v-if="testRaw" label="API 原始">
        <el-tag type="warning" size="large">{{ testRaw }}</el-tag>
        <span class="hint">服务端 /ocr 的 result（应为公式，如 6+2=?）</span>
      </el-form-item>
      <el-form-item v-if="testResult" label="计算结果">
        <el-tag type="success" size="large">{{ testResult }}</el-tag>
        <span class="hint">插件本地求值后填入的值</span>
      </el-form-item>
      <el-form-item v-if="testApiPayload" label="完整响应">
        <el-input
          :model-value="testApiPayload"
          type="textarea"
          :rows="6"
          readonly
        />
      </el-form-item>
    </el-form>
  </div>
</template>

<style scoped>
.page {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px 20px 40px;
  font-family: "PingFang SC", "Segoe UI", sans-serif;
}
.header h1 {
  margin: 0 0 8px;
  font-size: 20px;
}
.header p {
  margin: 0 0 16px;
  color: #6b7280;
  font-size: 14px;
}
.form {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px 12px 8px;
  background: #fff;
}
code {
  padding: 1px 5px;
  border-radius: 4px;
  background: #f3f4f6;
  font-size: 12px;
}
.hint {
  display: block;
  margin-top: 6px;
  color: #9ca3af;
  font-size: 12px;
  line-height: 1.4;
}
</style>

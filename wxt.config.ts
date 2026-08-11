import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  outDir: 'dist',
  manifest: {
    name: '算术验证码助手',
    description: '右键识别算术验证码（如 6+2=?），调用自建 API 填入计算结果',
    version: '0.2.0',
    permissions: ['contextMenus', 'storage', 'activeTab', 'scripting', 'clipboardWrite'],
    host_permissions: ['<all_urls>', 'https://ocr.kcshen.cn/*'],
    action: {
      default_title: '算术验证码助手',
    },
    options_ui: {
      page: 'options.html',
      open_in_tab: true,
    },
  },
});

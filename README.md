# 算术验证码助手

轻量 Chrome 插件：右键算术验证码图片，调用自建 API，自动填入**计算结果**。

例：`6 + 2 = ?` → 填入 `8`

## 为什么很小

识别全部交给服务端（如 `https://ocr.kcshen.cn/calculate`），插件本身**不打包** ONNX / WASM 模型。

服务端部署见 [docs/self-hosted-ddddocr.md](./docs/self-hosted-ddddocr.md)。

## 使用

```bash
npm install
npm run dev    # 或 npm run build
```

Chrome → `chrome://extensions` → 加载 `dist/chrome-mv3`。

1. 打开扩展设置，确认 API URL（默认 `https://ocr.kcshen.cn/calculate`）
2. 网页上对验证码图片右键 →「识别并填入计算结果」

## 技术栈

WXT + Vue3 + Element Plus（仅设置页 / Popup）

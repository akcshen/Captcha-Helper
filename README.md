# 算术验证码助手

轻量 Chrome 插件：右键算术验证码图片，调用自建 API，自动填入**计算结果**。

例：`6 + 2 = ?` → 填入 `8`

## 为什么很小

识别全部交给服务端（如 `https://ocr.kcshen.cn/ocr`），插件本身**不打包** ONNX / WASM 模型。

- 服务端部署：[docs/deploy-official-ddddocr.md](./docs/deploy-official-ddddocr.md)（自定义模型推荐 [tools/ddddocr-api-156](./tools/ddddocr-api-156)，固定 `ddddocr==1.5.6`）
- 插件取图与识别流程：[docs/image-ocr-flow.md](./docs/image-ocr-flow.md)

## 使用

```bash
npm install
npm run dev    # 或 npm run build
```

Chrome → `chrome://extensions` → 加载 `dist/chrome-mv3`。

1. 打开扩展设置，确认 API URL（默认 `https://ocr.kcshen.cn/ocr`）
2. 网页上对验证码图片右键 →「识别并填入计算结果」

## 技术栈

WXT + Vue3 + Element Plus（仅设置页 / Popup）

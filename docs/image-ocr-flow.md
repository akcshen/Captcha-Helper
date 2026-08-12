# 验证码图片处理与识别流程

本文描述插件**当前实现**（右键识别算术验证码）里，图片如何获取、编码、请求 OCR，以及结果如何变成填入值。

相关代码：

| 步骤 | 文件 |
|------|------|
| 右键菜单入口 | `entrypoints/background.js` |
| 取图 | `lib/image.js`、`lib/mime.js` |
| OCR 请求 / 算式求值 | `lib/ocr/index.js`、`lib/ocr/utils.js`、`lib/ocr/math-captcha.js` |
| 填入输入框 | Content Script（`FILL_CAPTCHA`） |

---

## 总览

```
网页 <img>
  │ 右键「识别并填入计算结果」
  ▼
Background
  │ 1. getCaptchaImageBlob(tabId, srcUrl)  → Blob
  │ 2. recognize(blob)
  │      ├─ blob → 纯 base64（无 data: 前缀）
  │      ├─ POST { image: base64 } → 配置的 /ocr
  │      └─ 解析 result，本地算算术 → 答案字符串
  ▼
Content Script
  └─ 填入附近输入框 / 复制到剪贴板 + toast
```

**重要：** 插件侧**不做**灰度、缩放、裁剪、去噪等图像预处理；发出去的是原图（或跨域失败时的 PNG 截图）的 base64。像素级处理由服务端 ddddocr 完成。

---

## 1. 取图 → `Blob`

入口：`getCaptchaImageBlob(tabId, srcUrl)`。

### 1.1 优先：按 URL 下载（`fetchImageBlob`）

| `srcUrl` 类型 | 行为 |
|---------------|------|
| `data:...` | `fetch(dataUrl)` → Blob |
| `blob:...` | 直接报错（需走页面截取） |
| `http(s):...` 等 | `fetch(srcUrl, { credentials: 'omit', cache: 'no-store' })` |

下载后调用 `fixBlobMime`：读文件头（`lib/mime.js` 的 `sniffImageMime`）校正 `Blob.type`（jpeg / png / gif / webp / bmp）。**只改 MIME，不改像素内容。**

### 1.2 回退：页面内 canvas 截取（`captureImageFromTab`）

当 URL 下载失败（常见于跨域）时：

1. 在目标 tab 注入脚本，按 `src` / `currentSrc` 匹配 `<img>`
2. 用 `naturalWidth` × `naturalHeight` 建 canvas，`drawImage`
3. `canvas.toDataURL('image/png')` → 再转成 Blob

跨域污染导致 canvas 读失败时，会抛出明确错误。

### 1.3 Options「测试识别」

设置页本地选图时，同样可走 canvas / dataURL，再经 `RECOGNIZE_DATA_URL` 消息交给 Background 的 `recognize`。

---

## 2. 编码 → 纯 base64

`blobToBase64`（`lib/ocr/utils.js`）：

1. `blob.arrayBuffer()` → `Uint8Array`
2. 分块拼成二进制字符串 → `btoa`
3. 得到**不带** `data:image/...;base64,` 前缀的字符串

---

## 3. 请求 OCR

`recognize`（`lib/ocr/index.js`）：

1. 读 `chrome.storage` 配置（API URL、可选 Header、超时）
2. `toOcrUrl`：把历史 `/calculate`、`/classification` 规范成官方 **`/ocr`**；若已是 `/ocr` 或带路径基址则补全
3. 请求体：

```http
POST <apiUrl 规范后的 /ocr>
Content-Type: application/json

{ "image": "<纯 base64>" }
```

4. 从响应里取识别文本（优先字段：`data` / `result` / `text`）
5. `toMathAnswer`：若已是数字则直接用；否则用 `solveMathCaptcha` 解析算式并求值（如 `6+2=?` → `8`）

插件默认 API：`https://ocr.kcshen.cn/ocr`（反代到自建官方 ddddocr）。服务端部署见 [deploy-official-ddddocr.md](./deploy-official-ddddocr.md)。

---

## 4. 填入与提示

Background 拿到答案字符串后：

1. 写入 `lastResult` 到 storage
2. 向 Content Script 发 `{ type: 'FILL_CAPTCHA', text, srcUrl }`
3. 填入成功 → toast「已填入」；找不到输入框 → 复制结果并 toast「已复制」

---

## 5. 与「自定义训练模型」的关系

| 环节 | 是否依赖自定义 onnx |
|------|---------------------|
| 取图 / base64 / POST `/ocr` | 否，流程相同 |
| 默认内置模型能否认出 `+` 等符号 | 视实测；若符号丢失需挂训练产物 |
| 挂载 `*.onnx` + `charsets.json` | 仅服务端环境变量，插件无需改协议 |

训练与挂载说明见 [kaptcha-dddd-train.md](./kaptcha-dddd-train.md)。

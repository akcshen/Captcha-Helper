# Captcha Helper 浏览器插件设计

**日期：** 2026-08-11  
**状态：** 已确认  
**目标平台：** Chrome Manifest V3  
**技术栈：** WXT + Vue3 + Vite + Element Plus + JavaScript

## 1. 背景与目标

帮助用户识别网页上的**简单图片文字验证码**（数字/字母），通过右键菜单识别并自动填入附近输入框。

支持两种识别方式：

- **本地 OCR**（默认，Tesseract.js）
- **第三方 / 自建 API**（超级鹰、自定义 HTTP 接口）

## 2. 范围

### 2.1 MVP 包含

- 右键 `<img>` →「识别验证码并填入」
- 本地 Tesseract.js 识别
- 超级鹰 API、自定义 OCR API
- Options 设置页（引擎切换、凭证、白名单、测试识别）
- Popup 极简状态页（当前引擎 + 打开设置）
- 找不到输入框时复制结果并提示
- 明确的失败 toast

### 2.2 MVP 不包含

- 滑块 / 点选 / 拼图等交互型验证码
- 页面自动检测悬浮按钮
- Firefox / Edge 专项适配
- 识别历史云同步
- 自动刷新验证码
- 非 `<img>` 节点（如纯 CSS `background-image`）作为图片源

## 3. 架构

```
网页 img ──右键──► Background Service Worker
                      │
                      ├─ contextMenus
                      ├─ 读取 chrome.storage 配置
                      ├─ 获取图片 Blob
                      └─ 调用 OCR 引擎（local / chaojiying / custom）
                      │
                      ▼
                 Content Script
                      ├─ 定位附近验证码输入框
                      ├─ 填入并触发 input/change
                      └─ toast 提示

Options / Popup (Vue3 + Element Plus)
      └─ 读写 chrome.storage.local
```

### 3.1 职责

| 模块 | 职责 |
|------|------|
| Background | 右键菜单、读配置、取图、调度识别、向 Content Script 发结果 |
| Content Script | 找输入框、填值、触发事件、toast |
| Options | 引擎与凭证配置、白名单、超时、测试识别 |
| Popup | 展示当前引擎、入口到 Options |
| `lib/ocr/` | 统一 `recognize` 接口，可插拔引擎 |

### 3.2 权限（最小）

- `contextMenus`
- `storage`
- `activeTab`
- 使用远程 API 时按需配置 `host_permissions`（超级鹰域名、自定义 URL 由用户配置后动态或在文档中说明需配置）

敏感凭证仅存于 `chrome.storage.local`，不暴露给网页上下文。

## 4. 识别与填入流程

1. 用户右键页面上的 `<img>`。
2. 选择「识别验证码并填入」。
3. Background 获取图片：
   - 优先用图片 `src` fetch（注意跨域）；
   - 失败则在页面侧通过 canvas / scripting 截取可见图片区域为 Blob。
4. 读取配置：`engine` ∈ `local` | `chaojiying` | `custom`。
5. 调用对应引擎，得到字符串后清洗：去空白、按白名单过滤（默认 `0-9A-Za-z`）。
6. 向当前 tab Content Script 发送：

   ```js
   { type: 'FILL_CAPTCHA', text, targetInfo }
   ```

7. Content Script 查找输入框，优先级：
   1. 同表单内 `name` / `id` / `placeholder` / `class` 含 `captcha` / `verify` / `code` / `验证码` 的可见 input；
   2. 目标图片 DOM 附近的下一个可见 `input[type=text|tel]`（不含 password）；
   3. 都找不到 → 写入剪贴板 + toast「已复制，未找到输入框」。
8. 填入后派发 `input` 与 `change`（兼容框架受控组件）。

### 4.1 错误处理

| 情况 | 行为 |
|------|------|
| 非图片 / 取图失败 | toast「无法获取验证码图片」 |
| OCR / API 失败 | toast 具体原因（超时、Key 无效、网络错误等） |
| 结果为空 | toast「未识别到文字」 |

## 5. 识别引擎

统一接口：

```js
/**
 * @param {Blob|string} image
 * @param {object} options
 * @returns {Promise<{ text: string, engine: string }>}
 */
async function recognize(image, options) {}
```

| 引擎 ID | 说明 |
|---------|------|
| `local` | Tesseract.js（WASM），默认；语言 `eng`；支持白名单与超时 |
| `chaojiying` | 超级鹰 HTTP API：用户名、密码、softId、softKey、codeType |
| `custom` | 自建：`POST` 图片 base64，期望响应 `{ text: string }`；可选自定义 Header |

默认配置：

- `engine`: `local`
- `whitelist`: `0-9A-Za-z`
- `timeoutMs`: `30000`

本地模型按需加载，避免 Background 冷启动过重。

## 6. UI

### 6.1 Options

- 引擎单选：本地 / 超级鹰 / 自定义
- 本地：字符白名单、超时
- 超级鹰：账号、密码、softId、softKey、codeType（默认英文数字类）
- 自定义：API URL、可选 Header（如 Authorization）
- 「测试识别」：上传样例图并展示结果

### 6.2 Popup

- 当前引擎展示
- 「打开设置」按钮
- 可选：最近一次识别结果预览

## 7. 目录结构

```
Captcha-Helper/
├── entrypoints/
│   ├── background.ts
│   ├── content.ts
│   ├── popup/
│   └── options/
├── lib/
│   ├── ocr/
│   │   ├── index.js
│   │   ├── local-tesseract.js
│   │   ├── chaojiying.js
│   │   └── custom.js
│   ├── fill-input.js
│   ├── image.js
│   └── storage.js
├── components/
├── assets/
├── wxt.config.ts
├── package.json
└── docs/superpowers/specs/
```

说明：WXT 脚手架可能默认 TypeScript 入口；业务代码优先 JavaScript，与团队栈一致。若脚手架强制 `.ts` 入口文件，入口可保持薄封装并调用 `.js` 模块。

## 8. 验收标准

1. 带文字验证码图的登录页：右键图片 → 识别 → 自动填入附近输入框。
2. Options 可切换三种引擎，刷新后配置仍在。
3. 找不到输入框时复制结果并提示。
4. 取图失败 / 识别失败有明确 toast。
5. `npm run dev` 可加载到 Chrome；`npm run build` 产出可安装包。

## 9. 后续（非 MVP）

- 自动检测验证码图片 + 悬浮按钮
- `background-image` / canvas 验证码截取增强
- 更多打码平台适配
- Firefox 适配
- 识别历史本地列表

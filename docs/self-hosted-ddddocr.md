# 自建 OCR（ddddocr）方案说明

**日期：** 2026-08-11  
**状态：** 已对接插件  
**关联：** [design.md](./design.md)（插件总体设计）

## 1. 背景

目标验证码多为**算术题图片**，例如样例：

- 文件：`samples/math-captcha.gif`
- 画面内容：`6 + 2 = ?`
- 期望填入输入框：**`8`**（最终答案，不是题目原文）

常见特征：蓝字、轻微波浪扭曲、阴影、边框；运算符可能含 `+ - * / × ÷`，结尾可能有 `=?` / `？`。

本地 Tesseract 对此类扭曲算式准确率不稳定；付费打码平台可用但持续计费。  
因此推荐在 **1Panel** 上部署成熟开源服务，插件走现有 **自定义 API** 引擎。

## 2. 方案结论

| 项 | 选择 |
|----|------|
| 部署方式 | 1Panel + Docker |
| 开源方案 | **ARM：本机构建** [liheji/ddddocr](https://github.com/liheji/ddddocr)；AMD64 可直接用 `yilee01/ddddocr:latest` |
| 接口 | `POST /calculate`（识别算式并直接返回答案） |
| 插件对接 | `engine = custom`，URL 指向 `/calculate` |
| 费用 | 自建服务器成本；不依赖第三方按次付费 |

备选（不优先）：

- 官方 `sml2h3/ddddocr` Docker API：维护好，但通常只返回 OCR 原文，算式需插件再计算
- 超级鹰等付费平台：运维最省，持续扣费

## 3. 架构

```
网页 <img> 验证码
  → 插件 Background
  → POST https://ocr.kcshen.cn/calculate
       Body: { "image": "<base64>" }   // 不要传自定义 charset 字符串
  → ddddocr：OCR 算式并求值
  → { "code": 0, "msg": "success", "data": 8 }
  → 插件只填入计算结果「8」（若拿到算式原文会本地再求值）
```

## 4. 服务端部署（1Panel）

### 4.1 创建容器（重要：架构）

先确认 CPU：

```bash
uname -m
# aarch64 / arm64 → ARM
# x86_64 → AMD64
```

| 架构 | 怎么部署 |
|------|----------|
| **AMD64** | 可直接拉 `yilee01/ddddocr:latest` |
| **ARM64（本服务器）** | **不要直接拉 yilee01**（仅 amd64，会 `exec format error`）；在本机 **源码构建** |

#### ARM64 推荐：源码构建（保留 `/calculate`）

镜像源码仓库：[liheji/ddddocr](https://github.com/liheji/ddddocr)（即 yilee01 镜像的上游封装）

```bash
# 1. 清掉失败的 amd64 容器/镜像
docker stop ddddocr 2>/dev/null
docker rm ddddocr 2>/dev/null
docker rmi yilee01/ddddocr:latest 2>/dev/null

# 2. 克隆并在 ARM 本机构建（耗时可能较长）
git clone https://github.com/liheji/ddddocr.git
cd ddddocr
docker build -t ddddocr-arm:latest .

# 3. 运行
docker run -d \
  -p 7777:7777 \
  --restart=always \
  --name ddddocr \
  ddddocr-arm:latest

# 4. 检查
docker ps | grep ddddocr
curl http://127.0.0.1:7777/health
```

若构建失败（常见于 onnxruntime 在 ARM 上缺包），把 `docker build` 完整报错贴出来再排查。

#### AMD64 可直接拉镜像

```bash
docker run -d \
  -p 7777:7777 \
  --restart=always \
  --name ddddocr \
  yilee01/ddddocr:latest
```

说明：容器默认端口 `7777`；可用 `-e PORT=8888 -p 8888:8888` 改端口。

### 4.2 反代与 HTTPS（本项目域名）

**域名：** `ocr.kcshen.cn`  
**上游：** `http://127.0.0.1:7777`  
**插件 API：** `https://ocr.kcshen.cn/calculate`

1Panel 操作：

1. 先确认 DNS：`ocr.kcshen.cn` A 记录指向服务器公网 IP
2. **网站** → **创建网站** → 类型选 **反向代理**
3. 主域名填：`ocr.kcshen.cn`
4. 代理地址填：`http://127.0.0.1:7777`
5. 创建后进入该站点 → **HTTPS** → 申请 Let's Encrypt 证书并开启强制 HTTPS
6. 浏览器访问：`https://ocr.kcshen.cn/health` 应返回正常 JSON

若 1Panel 版本界面是「代理传递」等高级项，保持默认即可；一般不需要改路径前缀（根路径 `/` 直接转到容器）。

### 4.3 安全建议

- 不要把 OCR 接口裸奔到公网无鉴权
- 优先：IP 白名单 / 仅内网 / 反代 Basic Auth / 自定义 Header Token
- 插件 Options 的「自定义 Header」可填：`{"Authorization":"Bearer 你的令牌"}`（需与反代或网关约定一致）

### 4.4 健康检查

```bash
curl http://127.0.0.1:7777/health
```

预期大致为：

```json
{ "code": 0, "msg": "API运行成功！", "data": { "status": "running", "version": "1.0.0" } }
```

## 5. API 约定

### 5.1 计算验证码（推荐）

```http
POST /calculate
Content-Type: application/json

{
  "image": "<base64 字符串，可无 data: 前缀>",
  "charset_ranges": 7
}
```

说明：`charset_ranges` **仅支持内置整数索引 0–7**，不接受自定义字符串/列表。

| 索引 | 含义 |
|------|------|
| 0 | 纯数字 |
| 1 | 纯小写 |
| 2 | 纯大写 |
| 3 | 小写+大写 |
| 4 | 小写+数字 |
| 5 | 大写+数字 |
| 6 | 小写+大写+数字 |
| 7 | 默认完整字符库（推荐，算术题） |

也可不传该字段，使用服务端默认。

成功响应：

```json
{
  "code": 0,
  "msg": "success",
  "data": 8
}
```

失败响应：

```json
{
  "code": 400,
  "msg": "错误信息",
  "data": null
}
```

### 5.2 仅 OCR（一般不直接用于算术填入）

`POST /classification` 返回的是识别文本（如 `6+2=?`），不是答案。  
算术场景请优先用 `/calculate`。

## 6. 插件对接要点

### 6.1 Options 配置

| 配置项 | 示例值 |
|--------|--------|
| 引擎 | 自定义 API |
| API URL | `https://ocr.kcshen.cn/calculate` |
| Header（可选） | `{"Authorization":"Bearer xxx"}` |
| 超时 | `30000` |

### 6.2 响应字段适配

当前 `lib/ocr/custom.js` 主要读取 `text` / `result` / `code`。  
ddddocr `/calculate` 成功时答案在 **`data`**，且 `code === 0` 表示成功。

需要做的适配：

1. 若响应含数字型 `code` 且 `code !== 0`，按失败处理，提示 `msg`
2. 取值优先级建议：`text` → `data`（当 `code === 0`）→ `result`
3. 将结果 `String(...)` 后填入；`/calculate` 已返回答案时，**不要再二次 eval 算式**（避免把 `8` 当表达式）

### 6.3 Manifest 权限

使用远程 API 时，需放行目标域名（`host_permissions` 或运行时权限）。  
敏感 Token 只存在 `chrome.storage.local`，不注入网页上下文。

## 7. 验收标准

1. 对 `samples/math-captcha.gif` 调用 `/calculate`，得到答案 `8`
2. 插件 Options「测试识别」上传该样例，展示 `8`
3. 真实页面右键验证码图 → 识别 → 输入框填入答案
4. 服务宕机 / `code !== 0` / 超时时，有明确 toast，不静默失败

## 8. 范围

**本期包含**

- 1Panel Docker 部署开源 ddddocr
- 插件自定义引擎对接 `/calculate`
- 样例图验收

**本期不包含**

- 自研 OCR 模型
- 滑块 / 点选验证码
- 付费打码平台替换自建
- 识别历史云同步

## 9. 参考链接

- ddddocr 上游：https://github.com/sml2h3/ddddocr
- Docker 镜像：https://hub.docker.com/r/yilee01/ddddocr
- 插件总体设计：`docs/design.md`
- 样例图：`samples/math-captcha.gif`

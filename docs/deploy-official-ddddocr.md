# 官方 ddddocr（sml2h3）部署说明

**仓库：** https://github.com/sml2h3/ddddocr  
**域名：** `ocr.kcshen.cn`  
**适用：** ARM 服务器源码构建；支持后续挂载自定义 `onnx`

> 说明：换成官方后，接口是 `POST /ocr`（返回公式文本），没有 `/calculate`。  
> 算式求值由插件 `lib/ocr/math-captcha.js` 完成。  
> **未挂自定义模型前**，通用模型对算术验证码仍可能不准；换项目是为了训完能加载专用模型。

---

## 1. 停掉旧服务（liheji / yilee01）

SSH 登录服务器：

```bash
docker ps | grep -i dddd
docker stop ddddocr
docker rm ddddocr
# 可选：删旧镜像省空间
# docker rmi ddddocr-arm:latest yilee01/ddddocr:latest
```

---

## 2. ARM 上构建官方镜像

```bash
cd /opt   # 或你习惯的目录
git clone https://github.com/sml2h3/ddddocr.git
cd ddddocr
```

### 先修 Dockerfile（重要）

官方 Dockerfile 在部分环境下会踩坑，构建前先改：

```bash
cd /opt/ddddocr

# 1) ENV 行尾注释（旧 Docker：Syntax error - can't find = in "#"）
sed -i 's/^\(ENV [A-Z0-9_]*=[^#]*\)#.*$/\1/' Dockerfile
sed -i 's/[[:space:]]*$//' Dockerfile

# 2) 新 Debian 已无 libgl1-mesa-glx，改为 libgl1
sed -i 's/libgl1-mesa-glx/libgl1/g' Dockerfile
```

然后构建：

```bash
docker build -t ddddocr-api:latest .
```

构建可能要一段时间，失败把完整日志留下。

---

## 3. 启动（先不挂自定义模型）

容器内默认 **8000**；宿主机映射 **7777**（给 1Panel 反代用）：

```bash
docker run -d \
  --name ddddocr \
  --restart=unless-stopped \
  -p 7777:8000 \
  -e DDDDOCR_HOST=0.0.0.0 \
  -e DDDDOCR_PORT=8000 \
  -e DDDDOCR_OCR=true \
  -e DDDDOCR_DET=false \
  -e DDDDOCR_SHOW_AD=false \
  ddddocr-api:latest
```

检查：

```bash
docker ps | grep ddddocr
curl -s http://127.0.0.1:7777/health
curl -s https://ocr.kcshen.cn/health
```

健康检查应返回正常 JSON。

---

## 4. 1Panel 反代

站点 `ocr.kcshen.cn` 代理地址保持：

```text
http://127.0.0.1:7777
```

---

## 5. 接口怎么调

### OCR（官方）

```http
POST https://ocr.kcshen.cn/ocr
Content-Type: application/json

{ "image": "<base64>" }
```

成功示例：

```json
{
  "result": "6+2=?",
  "processing_time": 0.12
}
```

插件自定义 API 填：`https://ocr.kcshen.cn/ocr`  
（需能解析 `result` 字段，再用本地算式逻辑填答案。）

### 本机快速测

```bash
# 任选一张 jpg
BASE64=$(base64 -w 0 /path/to/demo.jpg)   # mac: base64 -i file | tr -d '\n'
curl -s https://ocr.kcshen.cn/ocr \
  -H 'Content-Type: application/json' \
  -d "{\"image\":\"$BASE64\"}"
```

---

## 6. 训练完成后挂自定义模型

把文件放到服务器，例如：

```text
/opt/ocr-model/obd_math.onnx
/opt/ocr-model/charsets.json
```

重建容器：

```bash
docker stop ddddocr && docker rm ddddocr

docker run -d \
  --name ddddocr \
  --restart=unless-stopped \
  -p 7777:8000 \
  -v /opt/ocr-model:/models:ro \
  -e DDDDOCR_HOST=0.0.0.0 \
  -e DDDDOCR_PORT=8000 \
  -e DDDDOCR_SHOW_AD=false \
  -e DDDDOCR_IMPORT_ONNX_PATH=/models/obd_math.onnx \
  -e DDDDOCR_CHARSETS_PATH=/models/charsets.json \
  ddddocr-api:latest
```

再用真实验证码图测 `/ocr`，期望得到完整公式（含 `+` 等），插件算出数字。

---

## 7. 和旧服务对比

| | 旧 liheji | 新官方 sml2h3 |
|--|-----------|----------------|
| 自定义 onnx | ❌ | ✅ |
| 计算接口 | `/calculate` | 无，插件算 |
| OCR 接口 | `/classification` | `/ocr` |
| 默认端口 | 7777 | 容器 8000，宿主机映射 7777 |
| ARM | 需自构建 | 需自构建 |

---

## 8. 常见问题

| 现象 | 处理 |
|------|------|
| `exec format error` | 又拉了 amd64 镜像；必须在 ARM 上 `docker build` |
| `/calculate` 404 | 正常，官方没有该接口，改用 `/ocr` |
| `/ocr` 返回 500：`unexpected keyword argument 'colors'` | 官方 1.6.1 已知 bug，见下方修复 |
| 仍认成 `627` | 还在用内置模型；等自定义 onnx 挂上 |
| 构建失败 / onnxruntime | 把 `docker build` 日志发出来排查 |

### 修复 `/ocr` 的 colors 参数 bug

```bash
cd /opt/ddddocr
# 常见文件：ddddocr/api/app.py 或类似路径
grep -RIn "colors=" ddddocr/api/ 2>/dev/null | head

sed -i 's/colors=/color_filter_colors=/g; s/custom_color_ranges=/color_filter_custom_ranges=/g' \
  ddddocr/api/app.py 2>/dev/null || true
# 若实际文件名不同，用 grep 找到后改对应文件

docker stop ddddocr; docker rm ddddocr
docker build -t ddddocr-api:latest .
docker run -d --name ddddocr --restart=unless-stopped -p 7777:8000 \
  -e DDDDOCR_HOST=0.0.0.0 -e DDDDOCR_PORT=8000 -e DDDDOCR_OCR=true -e DDDDOCR_SHOW_AD=false \
  ddddocr-api:latest
```

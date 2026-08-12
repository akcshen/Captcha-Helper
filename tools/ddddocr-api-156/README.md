# ddddocr 1.5.6 薄 API（兼容插件 /ocr）

官方 **1.5.6 没有** `python -m ddddocr api` / `POST /ocr`（HTTP 从 1.6.0 才有）。  
自定义 onnx 与 1.5.x 更稳时，用本目录起一个最小 FastAPI，协议与插件一致：

```http
POST /ocr
{ "image": "<base64>" }

→ { "result": "6+2=?" }
```

也提供 `GET /health`。

---

## 服务器部署

```bash
# 1) 放代码（任选一种）
mkdir -p /opt/ddddocr-156
# 把本目录的 app.py / requirements.txt / Dockerfile 拷过去
# 或从本仓库: tools/ddddocr-api-156/

cd /opt/ddddocr-156

# 2) 自定义模型（可选）
mkdir -p /opt/ddddocr/models
# 放入 obd_math.onnx + charsets.json

# 3) 构建 & 启动（宿主机 7777 → 容器 8000）
docker build -t ddddocr-156:latest .

docker stop ddddocr 2>/dev/null; docker rm ddddocr 2>/dev/null

docker run -d \
  --name ddddocr \
  --restart=unless-stopped \
  -p 7777:8000 \
  -v /opt/ddddocr/models:/models:ro \
  -e DDDDOCR_IMPORT_ONNX_PATH=/models/obd_math.onnx \
  -e DDDDOCR_CHARSETS_PATH=/models/charsets.json \
  ddddocr-156:latest
```

不挂自定义模型时去掉 `-v` 和两个 `DDDDOCR_*` 环境变量即可（用 1.5.6 内置模型）。

自检：

```bash
curl -s http://127.0.0.1:7777/health
# {"status":"ok","ddddocr":"1.5.6","custom_model":true/false}
```

1Panel 反代仍指向 `http://127.0.0.1:7777`。

---

## 为何固定 1.5.6

| 版本 | 自定义 onnx（dddd_trainer） | 内置 HTTP `/ocr` |
|------|-----------------------------|------------------|
| 1.5.6 | 社区反馈更稳 | ❌ 需本薄 API |
| 1.6.x | 部分 onnx 识别异常 / 空 / 单字符 | ✅ |

插件仍填：`https://ocr.kcshen.cn/ocr`。

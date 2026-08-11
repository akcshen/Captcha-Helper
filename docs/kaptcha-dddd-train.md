# Kaptcha 算术验证码训练操作手册

**日期：** 2026-08-11  
**目标：** 训出专用 OCR 模型，识别线上「`6+2=?`」类算术验证码（答案如 `8`），避免通用 ddddocr 误识别成 `627`。  
**数据工具：** `tools/kaptcha-dataset`（不依赖 obd-server）  
**样式对齐：** RuoYi/Kaptcha（绿边、蓝字、ShadowGimpy、`KaptchaTextCreator`）  
**训练工具：** 开源 [dddd_trainer](https://github.com/sml2h3/dddd_trainer)  
**推理域名：** `https://ocr.kcshen.cn`

---

## 0. 流程总览

```text
① 任意电脑（可无 N 卡）
   → 生成 captcha-dataset/

② NVIDIA 电脑（推荐 GTX 1660 Ti）或云 GPU
   → dddd_trainer 训练
   → 得到 *.onnx + charsets.json

③ ARM / 无显卡服务器
   → 部署模型到 OCR 服务
   → 插件识别公式后算答案
```

### 机器怎么选

| 机器 | 生成数据 | 训练 | 部署推理 |
|------|----------|------|----------|
| 本机有 **GTX 1660 Ti** 等 N 卡 | ✅ | ✅ 推荐 | ✅ |
| 核显本（如 Iris Xe）/ 无显卡云服务器 | ✅ | ❌ 不建议 | ✅ |
| AutoDL 等云 GPU | 可上传已生成数据 | ✅ | — |
| `ocr.kcshen.cn`（ARM） | ✅ 也可 | ❌ | ✅ 最终部署点 |

**结论：** 有 1660 Ti 就本机训；只有核显就本机造数据 + 云 GPU 训，或拷到 1660 Ti 那台训。

---

## 1. 生成训练集

### 1.1 环境

- JDK 8+
- Maven（命令行有 `mvn`）

### 1.2 命令

在仓库根目录执行：

```bash
cd tools/kaptcha-dataset
mvn -q compile exec:java -Dexec.args="5000 ../../captcha-dataset"
```

参数说明：

| 参数 | 含义 | 默认 |
|------|------|------|
| 第 1 个 | 生成张数 | `5000` |
| 第 2 个 | 输出目录 | 当前目录下 `captcha-dataset` |

首次建议 **5000**；不够再补到 8000～10000。

### 1.3 产出结构（必须这样）

```text
captcha-dataset/
  labels.txt       # 训练用：000001.jpg<TAB>6+2=?
  answers.txt      # 对照用：000001.jpg<TAB>8（dddd_trainer 不读）
  images/
    000001.jpg
    000002.jpg
    ...
```

检查：

```bash
# 张数
ls captcha-dataset/images | wc -l

# 标签样例（应是公式，不是纯数字答案）
head -5 captcha-dataset/labels.txt
```

### 1.4 拷贝到训练机

把整个 `captcha-dataset` 文件夹拷到 1660 Ti 电脑或云实例，例如：

- Windows：`D:\captcha-dataset\`
- Linux / AutoDL：`/root/autodl-tmp/captcha-dataset/`

可用 U 盘、网盘、`scp`、压缩包上传。

---

## 2. 训练机环境准备（NVIDIA）

以下在 **有 N 卡的电脑** 或 **云 GPU 实例** 上操作。

### 2.1 确认显卡

```bash
nvidia-smi
```

能看到 GPU 名称（如 `GeForce GTX 1660 Ti`）即可。

### 2.2 安装 PyTorch（CUDA 版）

1. 打开 https://pytorch.org/get-started/locally/  
2. 按系统 / CUDA 版本生成安装命令（务必选 **CUDA**，不要 CPU）  
3. 安装后验证：

```bash
python -c "import torch; print(torch.__version__); print(torch.cuda.is_available()); print(torch.cuda.get_device_name(0))"
```

期望类似：

```text
2.x.x+cu118
True
GeForce GTX 1660 Ti
```

若 `False`：驱动或 PyTorch 装错，先别训。

### 2.3 克隆 dddd_trainer

```bash
git clone https://github.com/sml2h3/dddd_trainer.git
cd dddd_trainer
pip install -r requirements.txt
```

（若镜像已带齐全依赖，以不报错为准。）

---

## 3. 训练操作（逐步）

假设数据集路径为 `/path/to/captcha-dataset`（请改成你的真实路径）。

### 3.1 创建项目

```bash
cd dddd_trainer
python app.py create obd_math
```

不要加 `--single`（算术是多字符序列，不是单字分类）。

### 3.2（可选）改配置

文件：`projects/obd_math/config.yaml`

1660 Ti（6GB）建议：

```yaml
System:
  GPU: true
  GPU_ID: 0
Train:
  BATCH_SIZE: 16          # 显存不够改为 8
  TEST_BATCH_SIZE: 16
  TARGET:
    Accuracy: 0.97
    Cost: 0.05
    Epoch: 20
Model:
  ImageHeight: 64         # 须为 16 的倍数
  ImageChannel: 1         # 灰度
  ImageWidth: -1
  Word: false
```

### 3.3 缓存数据（labels.txt 模式）

```bash
python app.py cache obd_math /path/to/captcha-dataset file
```

注意末尾的 **`file`**：表示从 `labels.txt` 读标签（不要用文件名当标签，因为公式含 `*?/`）。

成功后再进入下一步。

### 3.4 开始训练

```bash
python app.py train obd_math
```

- 可断点续训：同样再执行 `train`  
- 达到 `TARGET` 会自动导出 onnx  
- 1660 Ti + 5000 张：粗估几十分钟到一两小时  

### 3.5 找到产物

目录一般在：

```text
dddd_trainer/projects/obd_math/models/
```

需要保留并拷走：

| 文件 | 用途 |
|------|------|
| `*.onnx` | 模型 |
| `charsets.json` | 字符集与输入尺寸配置 |

建议重命名方便部署，例如：

```text
obd_math.onnx
charsets.json
```

---

## 4. 云 GPU 训练（无本机 N 卡时）

以 [AutoDL](https://www.autodl.com/) 为例（其它平台类同）。

1. 本机先完成 **第 1 节** 生成数据并打包（zip）  
2. 租实例：镜像选 **PyTorch + CUDA**；任意能用的 N 卡；数据盘 ≥ 20GB  
3. 上传解压到例如 `/root/autodl-tmp/captcha-dataset`  
4. 在实例终端执行 **第 2～3 节**（路径换成上面的）  
5. 从 `projects/obd_math/models/` 下载 `onnx` + `charsets.json`  
6. **立刻关机/释放**，避免空挂扣费  

---

## 5. 本地抽检（部署前必做）

在任意已装 `ddddocr` 的机器：

```bash
pip install ddddocr==1.5.6
```

（社区反馈：部分新版本与 trainer 导出的 onnx 有兼容问题，优先用 1.5.x 验证。）

```python
import ddddocr

ocr = ddddocr.DdddOcr(
    det=False,
    ocr=False,
    show_ad=False,
    import_onnx_path="obd_math.onnx",
    charsets_path="charsets.json",
)

with open("/path/to/captcha-dataset/images/000001.jpg", "rb") as f:
    print(ocr.classification(f.read()))
# 期望类似：6+2=?   （不要是 627）
```

对照 `answers.txt` 同一文件名的答案，再用计算器或插件里的 `solveMathCaptcha` 验证。

抽几张含 `+ - * /` 的图都过一遍再部署。

---

## 6. 部署到 OCR 服务器

### 6.1 上传模型

例如服务器：

```text
/opt/ocr-model/obd_math.onnx
/opt/ocr-model/charsets.json
```

### 6.2 挂载并启用自定义模型

若使用官方 ddddocr API 容器，示例：

```bash
docker run -d \
  --name ddddocr \
  --restart=always \
  -p 8000:8000 \
  -v /opt/ocr-model:/models:ro \
  -e DDDDOCR_HOST=0.0.0.0 \
  -e DDDDOCR_PORT=8000 \
  -e DDDDOCR_IMPORT_ONNX_PATH=/models/obd_math.onnx \
  -e DDDDOCR_CHARSETS_PATH=/models/charsets.json \
  <你的ddddocr镜像>
```

说明：

- 当前若跑的是 `liheji` / `yilee01` 封装且**不认**上述环境变量，需改用官方 API 镜像，或在服务代码里写死 `DdddOcr(import_onnx_path=..., charsets_path=...)`。  
- 1Panel 反代仍指向容器端口；对外继续用 `https://ocr.kcshen.cn`。

### 6.3 接口与插件

- 识别接口返回**公式字符串**（如 `6+2=?`）时：插件用 `lib/ocr/math-captcha.js` 算出答案再填入。  
- 若你在服务端直接算好答案返回数字，插件取 `text` / `data` 即可。  

插件自定义 API 示例：`https://ocr.kcshen.cn/ocr`（以实际路径为准）。

---

## 7. 验收清单

- [ ] `labels.txt` 标签是公式（含 `+`/`-`/`*`/`/` 与 `=?`），不是只有答案  
- [ ] `torch.cuda.is_available() == True` 后才开始训  
- [ ] 训练产物同时有 `onnx` 与 `charsets.json`  
- [ ] 抽检多张图能认出运算符，不再稳定输出 `627`  
- [ ] 对真实登录页验证码图，最终填入正确数字  
- [ ] `https://ocr.kcshen.cn/health`（或等价健康检查）正常  

---

## 8. 常见问题

| 现象 | 处理 |
|------|------|
| `mvn: command not found` | 安装 Maven，或在已装 Maven 的机器生成数据 |
| `torch.cuda.is_available()` 为 False | 重装 CUDA 版 PyTorch；检查驱动 `nvidia-smi` |
| 显存 OOM | `BATCH_SIZE` 改为 `8` 或 `4` |
| cache 报错 / 标签乱码 | 确认用了 `file` 模式；`labels.txt` 为 UTF-8，分隔符是 Tab |
| 训练 acc 很高但 ddddocr 识别空/错 | 换 ddddocr 1.5.x 试；确认 onnx 与 charsets 成对、路径无误 |
| 通用模型返回 627 | 说明还在用默认模型，自定义 onnx 未生效 |
| Iris Xe / 纯 CPU 服务器想训 | 不建议；换 1660 Ti 或云 GPU |

---

## 9. 相关文件

| 路径 | 说明 |
|------|------|
| `tools/kaptcha-dataset/` | 最小导出工程 |
| `tools/kaptcha-dataset/README.md` | 导出快捷说明 |
| `docs/self-hosted-ddddocr.md` | OCR 服务部署（含 ARM、域名） |
| `lib/ocr/math-captcha.js` | 公式 → 答案 |
| `samples/math-captcha.gif` | 样例图（期望答案 8） |

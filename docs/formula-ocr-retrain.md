# 算术验证码公式 OCR 重训方案

**日期：** 2026-08-12  
**目标：** 降低识别错误率——重训「公式 OCR」模型，让 `/ocr` 返回公式，插件本地求值。  
**训练机：** 另机执行（需 NVIDIA GPU，如 GTX 1660 Ti / 云 GPU）  
**推理：** 现网 `ddddocr-api-156`（`ddddocr==1.5.6`）+ 自定义 onnx

更细的操作手册仍见：`docs/kaptcha-dddd-train.md`。本文是**纠错重训的验收版清单**。

---

## 1. 问题结论

| 现象 | 含义 |
|------|------|
| `/health` → `custom_model: true` | 自定义模型已挂上 |
| 训练同款图也经常错 | 不是「线上域差异」为主，是**当前模型/标签目标不对或训得不够** |
| 若 API 返回纯数字答案且错 | 很可能按「答案」训了；应改训「公式」 |

**正确分工：**

```text
图片 → OCR 模型 → "6+2=?" → 插件 math-captcha → "8" → 填入输入框
```

不要让模型直接猜答案数字。

---

## 2. 数据契约（必须遵守）

用仓库 `tools/kaptcha-dataset` 生成：

```bash
cd tools/kaptcha-dataset
mvn -q compile exec:java -Dexec.args="10000 ../../captcha-dataset"
```

| 文件 | 内容 | 用途 |
|------|------|------|
| `labels.txt` | `000001.jpg\t6+2=?` | **唯一训练标签**（公式） |
| `answers.txt` | `000001.jpg\t8` | 仅人工对照，**dddd_trainer 不读** |
| `images/*.jpg` | 160×60，绿边蓝字 ShadowGimpy | 与线上 Kaptcha 样式对齐 |

生成后立刻自检：

```bash
# 张数
ls captcha-dataset/images | wc -l

# 标签必须是公式，不能是纯数字
head -5 captcha-dataset/labels.txt
# 期望：
# 000001.jpg	3*7=?
# 000002.jpg	9-2=?
```

**不合格示例（禁止拿去训）：**

```text
000001.jpg	8          # 答案
000001.jpg	6+2=?@8    # 带 @ 原始串
```

建议规模：**10000** 张（至少 8000）。旧数据集若标签不对，**整包删掉重生成**，不要混用。

---

## 3. 训练机步骤

### 3.1 环境

```bash
nvidia-smi
python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
# 必须 True + 能看到 GPU 名
```

```bash
git clone https://github.com/sml2h3/dddd_trainer.git
cd dddd_trainer
pip install -r requirements.txt
```

把 `captcha-dataset` 拷到训练机，例如：

- Windows：`D:\captcha-dataset\`
- Linux / AutoDL：`/root/autodl-tmp/captcha-dataset/`

### 3.2 建项目 + 配置

```bash
python app.py create obd_math
# 不要加 --single（算术是多字符序列）
```

编辑 `projects/obd_math/config.yaml`（1660 Ti 6GB 参考）：

```yaml
System:
  GPU: true
  GPU_ID: 0
Train:
  BATCH_SIZE: 16          # OOM 改为 8 或 4
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

### 3.3 缓存（file 模式）

```bash
python app.py cache obd_math /path/to/captcha-dataset file
```

末尾 **`file`** 必填：从 `labels.txt` 读标签（公式含 `*?/`，不能用文件名当标签）。

### 3.4 训练

```bash
python app.py train obd_math
```

- 可断点续训：再执行同一条 `train`
- 达到 TARGET 会导出 onnx
- 1660 Ti + 1 万张：大约 1～数小时

### 3.5 产物

从 `dddd_trainer/projects/obd_math/models/` 拷走**成对**文件：

```text
obd_math.onnx
charsets.json
```

两者必须同一次训练产出，不可新旧混搭。

---

## 4. 部署前本地抽检（另机即可）

```bash
pip install ddddocr==1.5.6
```

```python
import ddddocr

ocr = ddddocr.DdddOcr(
    det=False,
    ocr=False,
    show_ad=False,
    import_onnx_path="obd_math.onnx",
    charsets_path="charsets.json",
)

with open("captcha-dataset/images/000001.jpg", "rb") as f:
    print(ocr.classification(f.read()))
# 期望：与 labels.txt 该行公式一致，例如 6+2=?
# 不要是 627；也不要是单独一个答案数字（除非碰巧等于公式，那也不对）
```

**批量门槛（建议）：** 随机 50 张，`classification` 结果与 `labels.txt` **完全一致 ≥ 90%**，再上传服务器。

抽几张含 `+ - * /` 的都过一遍。

---

## 5. 部署到 ocr.kcshen.cn（156）

模型放到服务器，例如：

```text
/opt/ddddocr/models/obd_math.onnx
/opt/ddddocr/models/charsets.json
```

```bash
docker stop ddddocr; docker rm ddddocr

docker run -d \
  --name ddddocr \
  --restart=unless-stopped \
  -p 7777:8000 \
  -v /opt/ddddocr/models:/models:ro \
  -e DDDDOCR_IMPORT_ONNX_PATH=/models/obd_math.onnx \
  -e DDDDOCR_CHARSETS_PATH=/models/charsets.json \
  ddddocr-156:latest

curl -s http://127.0.0.1:7777/health
# 期望：{"status":"ok","ddddocr":"1.5.6","custom_model":true}
```

用训练图打线上：

```bash
BASE64=$(base64 -i captcha-dataset/images/000001.jpg | tr -d '\n')  # mac
curl -s https://ocr.kcshen.cn/ocr \
  -H 'Content-Type: application/json' \
  -d "{\"image\":\"$BASE64\"}"
# 期望 result 为公式，如 "6+2=?"
```

插件设置页「上传并识别」应看到：

- **API 原始** = 公式  
- **计算结果** = 数字答案  

---

## 6. 验收清单

- [ ] `labels.txt` 全是公式（含运算符与 `=?`）
- [ ] `cache … file` 成功
- [ ] 训练达到目标或验证准确率明显可用
- [ ] `onnx` 与 `charsets.json` 成对部署
- [ ] `/health` → `custom_model: true` 且 `ddddocr: 1.5.6`
- [ ] 50 张合成图公式一致率 ≥ 90%
- [ ] 插件「API 原始」为公式，不再把错误数字当最终答案糊弄过去
- [ ] 真实登录页抽测若干张，填入结果正确

---

## 7. 常见翻车点

| 现象 | 处理 |
|------|------|
| `/ocr` 返回答案数字且经常错 | 标签用了答案 → 按本文重生成 + 重训公式 |
| 训练 acc 高，1.5.6 推理空/单字符 | 确认成对 charsets；推理固定 1.5.6（现网 156） |
| 仍像通用模型（如 `627`） | 环境变量/挂载未生效；看 `/health.custom_model` |
| cache 乱码 | UTF-8 + Tab；必须 `file` 模式 |
| 显存 OOM | `BATCH_SIZE` 降到 8/4 |
| 合成图准、真实验证码仍差 | 再对齐线上 Kaptcha 配置，或混入少量真实截图微调（第二阶段） |

---

## 8. 本仓库相关路径

| 路径 | 说明 |
|------|------|
| `tools/kaptcha-dataset/` | 生成训练集 |
| `tools/ddddocr-api-156/` | 线上推理壳 |
| `docs/kaptcha-dddd-train.md` | 完整训练手册 |
| `docs/deploy-official-ddddocr.md` | 部署说明（含 156） |
| `lib/ocr/math-captcha.js` | 公式 → 答案 |
| 设置页测试 | 可见 API 原始 / 计算结果 |

---

## 9. 范围外（本方案不做）

- 不改插件求值主逻辑（已支持展示 raw）
- 不做「图 → 直接答案」分类模型
- 不做插件侧多模型投票等补丁（等本方案达标后再考虑）

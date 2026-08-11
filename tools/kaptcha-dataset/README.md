# Kaptcha 数据集导出（最小独立工具）

不依赖 `obd-server`。仅需 JDK 8+ 与 Maven。

样式对齐线上：绿边框、蓝字、ShadowGimpy、`KaptchaTextCreator` 算术逻辑。

## 生成数据集

```bash
cd tools/kaptcha-dataset

# 推荐：5000 张输出到仓库根目录
mvn -q compile exec:java -Dexec.args="5000 ../../captcha-dataset"
```

产出：

```text
captcha-dataset/
  labels.txt      # 000001.jpg<TAB>6+2=?
  answers.txt     # 000001.jpg<TAB>8
  images/*.jpg
```

把整个 `captcha-dataset` 拷到 **NVIDIA 训练机**（如 1660 Ti）或云 GPU。

## 完整训练 / 部署流程

见仓库文档（已按步骤写全）：

**[`docs/kaptcha-dddd-train.md`](../../docs/kaptcha-dddd-train.md)**

内容包括：机器怎么选、环境安装、cache/train、抽检、部署到 `ocr.kcshen.cn`、验收与排错。

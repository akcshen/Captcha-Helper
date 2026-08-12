FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libgl1 \
      libglib2.0-0 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

ENV HOST=0.0.0.0
ENV PORT=8000
# 可选：挂载自定义模型后设置
# ENV DDDDOCR_IMPORT_ONNX_PATH=/models/obd_math.onnx
# ENV DDDDOCR_CHARSETS_PATH=/models/charsets.json

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app:app --host ${HOST} --port ${PORT}"]

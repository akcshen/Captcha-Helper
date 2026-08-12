"""
ddddocr==1.5.6 薄 HTTP 层，兼容 Captcha-Helper 的 POST /ocr。
"""

from __future__ import annotations

import base64
import binascii
import os
import time
from typing import Optional

import ddddocr
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
ONNX_PATH = (os.getenv("DDDDOCR_IMPORT_ONNX_PATH") or "").strip()
CHARSETS_PATH = (os.getenv("DDDDOCR_CHARSETS_PATH") or "").strip()

app = FastAPI(title="ddddocr-156", version="1.5.6")
_ocr: Optional[ddddocr.DdddOcr] = None
_custom = False


def get_ocr() -> ddddocr.DdddOcr:
    global _ocr, _custom
    if _ocr is not None:
        return _ocr

    if ONNX_PATH and CHARSETS_PATH:
        if not os.path.isfile(ONNX_PATH):
            raise RuntimeError(f"onnx 不存在: {ONNX_PATH}")
        if not os.path.isfile(CHARSETS_PATH):
            raise RuntimeError(f"charsets 不存在: {CHARSETS_PATH}")
        _ocr = ddddocr.DdddOcr(
            det=False,
            ocr=False,
            show_ad=False,
            import_onnx_path=ONNX_PATH,
            charsets_path=CHARSETS_PATH,
        )
        _custom = True
    else:
        # 内置模型；自定义模型场景请同时设置两个环境变量
        _ocr = ddddocr.DdddOcr(show_ad=False)
        _custom = False
    return _ocr


class OcrRequest(BaseModel):
    image: str = Field(..., description="纯 base64 或 data URL")


class OcrResponse(BaseModel):
    result: str
    processing_time: float


class HealthResponse(BaseModel):
    status: str
    ddddocr: str
    custom_model: bool


def decode_image(image: str) -> bytes:
    raw = image.strip()
    if "," in raw and raw.lower().startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        data = base64.b64decode(raw, validate=False)
    except (binascii.Error, ValueError) as err:
        raise HTTPException(status_code=400, detail=f"无效 base64: {err}") from err
    if not data:
        raise HTTPException(status_code=400, detail="图片为空")
    return data


@app.on_event("startup")
def _startup() -> None:
    get_ocr()


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    get_ocr()
    return HealthResponse(
        status="ok",
        ddddocr="1.5.6",
        custom_model=_custom,
    )


@app.post("/ocr", response_model=OcrResponse)
def ocr(body: OcrRequest) -> OcrResponse:
    started = time.perf_counter()
    try:
        engine = get_ocr()
        text = engine.classification(decode_image(body.image))
    except HTTPException:
        raise
    except Exception as err:  # noqa: BLE001 — 透出给调用方排查
        raise HTTPException(status_code=500, detail=str(err)) from err
    return OcrResponse(
        result=str(text or ""),
        processing_time=round(time.perf_counter() - started, 4),
    )

import { blobToBase64 } from './utils.js';
import { solveMathCaptcha } from './math-captcha.js';
import { getSettings } from '../storage.js';

/**
 * 调用官方 ddddocr /ocr 接口，拿到公式后再本地求值
 * @param {Blob} image
 * @param {import('../storage.js').AppSettings} [settings]
 */
export async function recognize(image, settings) {
  const cfg = settings || (await getSettings());
  if (!(image instanceof Blob) || image.size === 0) {
    throw new Error('无效的验证码图片');
  }
  if (!cfg.apiUrl) {
    throw new Error('请先在设置中填写 API URL');
  }

  /** @type {Record<string, string>} */
  let headers = { 'Content-Type': 'application/json' };
  if (cfg.headersJson?.trim()) {
    try {
      const parsed = JSON.parse(cfg.headersJson);
      if (parsed && typeof parsed === 'object') {
        headers = { ...headers, ...parsed };
      }
    } catch {
      throw new Error('Header 不是合法 JSON');
    }
  }

  const base64 = await blobToBase64(image);
  const timeoutMs = cfg.timeoutMs || 30000;
  const url = toOcrUrl(cfg.apiUrl);

  const data = await postJson(url, { image: base64 }, headers, timeoutMs);
  const raw = pickAnswer(data);
  if (raw === undefined || raw === null || raw === '') {
    throw new Error('API 未返回识别结果');
  }

  const answer = toMathAnswer(raw);
  if (!answer) {
    throw new Error(`未能得到计算结果（原始返回: ${String(raw).slice(0, 40)}）`);
  }
  return { text: answer };
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function toMathAnswer(raw) {
  if (raw === undefined || raw === null || raw === '') return null;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return formatNumber(raw);
  }

  const text = String(raw).trim();
  if (!text) return null;

  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return text;
  }

  // 若服务端偶尔返回算式原文，本地再求一次
  return solveMathCaptcha(text);
}

/**
 * @param {number} n
 */
function formatNumber(n) {
  if (Number.isInteger(n)) return String(n);
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return String(n);
}

/**
 * 将配置 URL 规范到官方 /ocr
 * @param {string} url
 */
function toOcrUrl(url) {
  const trimmed = String(url || '').trim().replace(/\/+$/, '');
  if (!trimmed) return trimmed;
  if (/\/calculate$/i.test(trimmed)) {
    return trimmed.replace(/\/calculate$/i, '/ocr');
  }
  if (/\/classification$/i.test(trimmed)) {
    return trimmed.replace(/\/classification$/i, '/ocr');
  }
  if (/\/ocr$/i.test(trimmed)) return trimmed;
  return `${trimmed}/ocr`;
}

/**
 * @param {string} url
 * @param {Record<string, unknown>} body
 * @param {Record<string, string>} headers
 * @param {number} timeoutMs
 */
async function postJson(url, body, headers, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`识别失败: HTTP ${res.status}`);
    }
    const data = await res.json();
    if (typeof data?.code === 'number' && data.code !== 0) {
      throw new Error(data.msg || `API 错误码: ${data.code}`);
    }
    return data;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('识别超时');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {any} data
 */
function pickAnswer(data) {
  if (data == null || typeof data !== 'object') return data;
  if (data.code === 0 && data.data != null && data.data !== '') return data.data;
  if (data.result != null && data.result !== '') return data.result;
  if (data.text != null && data.text !== '') return data.text;
  if (data.data != null && typeof data.data !== 'object') return data.data;
  return undefined;
}

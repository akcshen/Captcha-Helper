import { sniffImageMime } from './mime.js';

/**
 * @param {string} srcUrl
 * @returns {Promise<Blob>}
 */
export async function fetchImageBlob(srcUrl) {
  if (!srcUrl) {
    throw new Error('无法获取验证码图片');
  }

  if (srcUrl.startsWith('data:')) {
    const res = await fetch(srcUrl);
    return fixBlobMime(await res.blob());
  }

  if (srcUrl.startsWith('blob:')) {
    throw new Error('blob 图片需通过页面截取');
  }

  const res = await fetch(srcUrl, { credentials: 'omit', cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`下载图片失败: HTTP ${res.status}`);
  }
  return fixBlobMime(await res.blob());
}

/**
 * @param {Blob} blob
 * @returns {Promise<Blob>}
 */
async function fixBlobMime(blob) {
  const buffer = await blob.arrayBuffer();
  const sniffed = sniffImageMime(buffer);
  if (!sniffed || sniffed === blob.type) return blob;
  return new Blob([buffer], { type: sniffed });
}

/**
 * @param {number} tabId
 * @param {string} srcUrl
 * @returns {Promise<string>}
 */
export async function captureImageFromTab(tabId, srcUrl) {
  const [{ result }] = await browser.scripting.executeScript({
    target: { tabId },
    func: (targetSrc) => {
      const imgs = Array.from(document.images || []);
      let img =
        imgs.find((el) => el.currentSrc === targetSrc || el.src === targetSrc) || null;

      if (!img && targetSrc) {
        img = imgs.find(
          (el) =>
            el.src?.includes(targetSrc) ||
            el.currentSrc?.includes(targetSrc) ||
            targetSrc.includes(el.src),
        );
      }

      if (!img) {
        return { ok: false, error: '页面中未找到对应图片' };
      }

      try {
        const canvas = document.createElement('canvas');
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) {
          return { ok: false, error: '图片尺寸无效' };
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return { ok: true, dataUrl: canvas.toDataURL('image/png') };
      } catch (err) {
        return { ok: false, error: err?.message || 'canvas 截取失败（可能被跨域污染）' };
      }
    },
    args: [srcUrl],
  });

  if (!result?.ok || !result.dataUrl) {
    throw new Error(result?.error || '无法从页面截取验证码图片');
  }
  return result.dataUrl;
}

/**
 * @param {number} tabId
 * @param {string} srcUrl
 * @returns {Promise<Blob>}
 */
export async function getCaptchaImageBlob(tabId, srcUrl) {
  try {
    return await fetchImageBlob(srcUrl);
  } catch (fetchErr) {
    try {
      const dataUrl = await captureImageFromTab(tabId, srcUrl);
      const res = await fetch(dataUrl);
      return res.blob();
    } catch (captureErr) {
      throw new Error(
        captureErr?.message || fetchErr?.message || '无法获取验证码图片',
      );
    }
  }
}

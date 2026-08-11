import { fillCaptchaResult } from '../lib/fill-input.js';
import { showToast } from '../lib/toast.js';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'CAPTCHA_TOAST') {
        showToast(message.message || '', message.toastType || 'info');
        sendResponse({ ok: true });
        return true;
      }

      if (message?.type === 'FILL_CAPTCHA') {
        (async () => {
          const img = findImageBySrc(message.srcUrl);
          const status = await fillCaptchaResult(message.text || '', img);
          sendResponse({ ok: true, status });
        })();
        return true;
      }

      return undefined;
    });
  },
});

/**
 * @param {string} srcUrl
 * @returns {HTMLImageElement | null}
 */
function findImageBySrc(srcUrl) {
  if (!srcUrl) return null;
  const imgs = Array.from(document.images || []);
  const exact =
    imgs.find((el) => el.currentSrc === srcUrl || el.src === srcUrl) || null;
  if (exact) return exact;

  // 去掉 query 后再比（验证码图常带时间戳参数）
  const strip = (u) => {
    try {
      const url = new URL(u, location.href);
      url.search = '';
      url.hash = '';
      return url.href;
    } catch {
      return String(u || '').split('?')[0];
    }
  };
  const target = strip(srcUrl);
  return (
    imgs.find((el) => strip(el.currentSrc) === target || strip(el.src) === target) ||
    imgs.find(
      (el) =>
        (el.src && srcUrl.includes(el.src)) ||
        (el.currentSrc && srcUrl.includes(el.currentSrc)) ||
        (el.src && el.src.includes(target)) ||
        (el.currentSrc && el.currentSrc.includes(target)),
    ) ||
    null
  );
}

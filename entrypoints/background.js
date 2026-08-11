import { saveSettings } from '../lib/storage.js';
import { getCaptchaImageBlob } from '../lib/image.js';
import { recognize } from '../lib/ocr/index.js';

const MENU_ID = 'captcha-helper-recognize';

export default defineBackground(() => {
  const ensureMenu = () => {
    browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({
        id: MENU_ID,
        title: '识别并填入计算结果',
        contexts: ['image'],
      });
    });
  };

  browser.runtime.onInstalled.addListener(ensureMenu);
  ensureMenu();

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== MENU_ID || !tab?.id) return;

    const tabId = tab.id;
    try {
      await notifyContent(tabId, {
        type: 'CAPTCHA_TOAST',
        message: '正在计算验证码…',
        toastType: 'info',
      });

      const blob = await getCaptchaImageBlob(tabId, info.srcUrl || '');
      const { text } = await recognize(blob);

      if (!text) {
        await notifyContent(tabId, {
          type: 'CAPTCHA_TOAST',
          message: '未识别到结果',
          toastType: 'error',
        });
        return;
      }

      await saveSettings({ lastResult: text });

      const fillResult = await browser.tabs.sendMessage(tabId, {
        type: 'FILL_CAPTCHA',
        text,
        srcUrl: info.srcUrl || '',
      });

      if (fillResult?.status === 'filled') {
        await notifyContent(tabId, {
          type: 'CAPTCHA_TOAST',
          message: `已填入：${text}`,
          toastType: 'success',
        });
      } else {
        await notifyContent(tabId, {
          type: 'CAPTCHA_TOAST',
          message: `已复制：${text}（未找到输入框）`,
          toastType: 'info',
        });
      }
    } catch (err) {
      await notifyContent(tabId, {
        type: 'CAPTCHA_TOAST',
        message: err?.message || '识别失败',
        toastType: 'error',
      });
    }
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'RECOGNIZE_DATA_URL') {
      (async () => {
        try {
          if (!message.dataUrl) throw new Error('未收到图片数据');
          const res = await fetch(message.dataUrl);
          const blob = await res.blob();
          const result = await recognize(blob);
          if (result.text) {
            await saveSettings({ lastResult: result.text });
          }
          sendResponse({ ok: true, ...result });
        } catch (err) {
          sendResponse({ ok: false, error: err?.message || '识别失败' });
        }
      })();
      return true;
    }
    return undefined;
  });
});

/**
 * @param {number} tabId
 * @param {object} message
 */
async function notifyContent(tabId, message) {
  try {
    await browser.tabs.sendMessage(tabId, message);
  } catch {
    // ignore
  }
}

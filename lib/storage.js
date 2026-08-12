/**
 * @typedef {Object} AppSettings
 * @property {string} apiUrl
 * @property {string} headersJson
 * @property {number} timeoutMs
 * @property {string} lastResult
 */

/** @type {AppSettings} */
export const DEFAULT_SETTINGS = {
  apiUrl: 'https://ocr.kcshen.cn/ocr',
  headersJson: '',
  timeoutMs: 30000,
  lastResult: '',
};

/**
 * @returns {Promise<AppSettings>}
 */
export async function getSettings() {
  const stored = await browser.storage.local.get(null);
  /** @type {string} */
  let apiUrl = stored.apiUrl != null ? String(stored.apiUrl) : DEFAULT_SETTINGS.apiUrl;
  apiUrl = apiUrl.trim().replace(/\/+$/, '');
  // 旧版路径自动迁移到官方 /ocr
  if (/\/calculate$/i.test(apiUrl)) {
    apiUrl = apiUrl.replace(/\/calculate$/i, '/ocr');
  } else if (/\/classification$/i.test(apiUrl)) {
    apiUrl = apiUrl.replace(/\/classification$/i, '/ocr');
  }
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    apiUrl: apiUrl || DEFAULT_SETTINGS.apiUrl,
  };
}

/**
 * @param {Partial<AppSettings>} patch
 */
export async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await browser.storage.local.set(next);
  return next;
}

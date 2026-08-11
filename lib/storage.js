/**
 * @typedef {Object} AppSettings
 * @property {string} apiUrl
 * @property {string} headersJson
 * @property {number} timeoutMs
 * @property {string} lastResult
 */

/** @type {AppSettings} */
export const DEFAULT_SETTINGS = {
  apiUrl: 'https://ocr.kcshen.cn/calculate',
  headersJson: '',
  timeoutMs: 30000,
  lastResult: '',
};

/**
 * @returns {Promise<AppSettings>}
 */
export async function getSettings() {
  const stored = await browser.storage.local.get(null);
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
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

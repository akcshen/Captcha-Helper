const KEYWORDS = /captcha|verify|vcode|yzm|valid|auth.?code|check.?code|验证码|校验码|计算结果/i;

/**
 * @param {Element} el
 */
function isVisible(el) {
  if (!(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * @param {HTMLInputElement | HTMLTextAreaElement} input
 */
function isFillableInput(input) {
  if (input instanceof HTMLTextAreaElement) {
    if (input.disabled || input.readOnly) return false;
    return isVisible(input);
  }
  const type = (input.type || 'text').toLowerCase();
  if (['hidden', 'password', 'submit', 'button', 'checkbox', 'radio', 'file', 'image', 'email', 'tel', 'url'].includes(type)) {
    return false;
  }
  if (input.disabled || input.readOnly) return false;
  return isVisible(input);
}

/**
 * @param {HTMLInputElement | HTMLTextAreaElement} input
 */
function keywordScore(input) {
  const hay = [
    input.name,
    input.id,
    input.placeholder,
    input.className,
    input.getAttribute('aria-label'),
    input.getAttribute('autocomplete'),
  ]
    .filter(Boolean)
    .join(' ');
  return KEYWORDS.test(hay) ? 1 : 0;
}

/**
 * 收集候选输入框：优先图片附近容器，再回退到整页
 * @param {HTMLImageElement | null} img
 * @returns {(HTMLInputElement | HTMLTextAreaElement)[]}
 */
function collectCandidates(img) {
  /** @type {Set<HTMLInputElement | HTMLTextAreaElement>} */
  const set = new Set();

  const addFrom = (root) => {
    if (!root) return;
    root.querySelectorAll('input, textarea').forEach((el) => {
      if (
        (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
        isFillableInput(el)
      ) {
        set.add(el);
      }
    });
  };

  if (img) {
    // 从图片向上找带输入框的祖先（常见：同一行/同一验证码区域）
    let node = /** @type {Element | null} */ (img.parentElement);
    for (let depth = 0; node && depth < 8; depth += 1) {
      const inputs = Array.from(node.querySelectorAll('input, textarea')).filter(
        (el) =>
          (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
          isFillableInput(el),
      );
      if (inputs.length) {
        inputs.forEach((el) => set.add(/** @type {any} */ (el)));
        // 找到「不太大」的局部容器就停，避免一下子扩到整页 form
        if (inputs.length <= 6 || node.matches('form, [class*="captcha"], [class*="verify"], [class*="code"]')) {
          break;
        }
      }
      node = node.parentElement;
    }

    const form = img.closest('form');
    if (form) addFrom(form);
  }

  if (!set.size) addFrom(document);

  return Array.from(set);
}

/**
 * 按与验证码图片的空间关系打分（越大越优先）
 * @param {HTMLInputElement | HTMLTextAreaElement} input
 * @param {HTMLImageElement} img
 */
function proximityScore(input, img) {
  const ir = input.getBoundingClientRect();
  const mr = img.getBoundingClientRect();
  const ix = ir.left + ir.width / 2;
  const iy = ir.top + ir.height / 2;
  const mx = mr.left + mr.width / 2;
  const my = mr.top + mr.height / 2;
  const dist = Math.hypot(ix - mx, iy - my);

  // 距离越近分越高
  let score = 100000 - dist;

  // 同一行（验证码常见：输入框在左，图片在右）
  const sameRow = Math.abs(iy - my) <= Math.max(ir.height, mr.height, 24);
  if (sameRow) score += 8000;

  // 在图片左侧
  if (ir.right <= mr.left + 8) score += 5000;
  // 紧挨图片（间距不大）
  const gapX = mr.left - ir.right;
  if (gapX >= -4 && gapX <= 80) score += 3000;

  // 在图片正上方/下方且水平重叠
  const overlapX = Math.min(ir.right, mr.right) - Math.max(ir.left, mr.left);
  if (overlapX > 0 && ir.bottom <= mr.top + 8) score += 2000;

  // 关键词加权（不能压过真正邻近的框）
  score += keywordScore(input) * 2500;

  // 验证码框通常较短
  const maxLen = Number(input.getAttribute('maxlength'));
  if (maxLen > 0 && maxLen <= 8) score += 1500;
  if (maxLen > 0 && maxLen <= 4) score += 500;

  // 明显是账号类的降权
  const hay = [input.name, input.id, input.placeholder, input.className].filter(Boolean).join(' ');
  if (/user|account|login|phone|mobile|email|用户|账号|手机|邮箱/i.test(hay)) {
    score -= 6000;
  }

  return score;
}

/**
 * @param {HTMLImageElement | null} img
 * @returns {HTMLInputElement | HTMLTextAreaElement | null}
 */
export function findCaptchaInput(img) {
  const inputs = collectCandidates(img);
  if (!inputs.length) return null;

  if (img) {
    const ranked = inputs
      .map((input) => ({ input, score: proximityScore(input, img) }))
      .sort((a, b) => b.score - a.score);
    return ranked[0]?.input || null;
  }

  // 无图片时：关键词优先，否则第一个
  const withKw = inputs.filter((el) => keywordScore(el) > 0);
  return withKw[0] || inputs[0] || null;
}

/**
 * @param {HTMLInputElement | HTMLTextAreaElement} input
 * @param {string} text
 */
export function fillInput(input, text) {
  input.focus();
  const proto =
    input instanceof HTMLTextAreaElement
      ? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
      : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  proto?.set?.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
}

/**
 * @param {string} text
 * @param {HTMLImageElement | null} [img]
 * @returns {Promise<'filled' | 'copied'>}
 */
export async function fillCaptchaResult(text, img = null) {
  const input = findCaptchaInput(img);
  if (input) {
    fillInput(input, text);
    return 'filled';
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
  return 'copied';
}

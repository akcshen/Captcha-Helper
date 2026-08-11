/**
 * 算术验证码：识别出算式后求值填入结果（如 6+2=? → 8）
 */

/**
 * @param {string} text
 */
export function normalizeOcrNoise(text) {
  return (
    String(text || '')
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[＋]/g, '+')
      .replace(/[－﹣−—–]/g, '-')
      .replace(/[×✖✕＊﹡]/g, '*')
      .replace(/[÷／⁄]/g, '/')
      .replace(/[＝═]/g, '=')
      .replace(/[？]/g, '?')
      .replace(/加/g, '+')
      .replace(/减/g, '-')
      .replace(/乘/g, '*')
      .replace(/除/g, '/')
      .replace(/等于?/g, '=')
      // OCR 常见把 + 认成 t/T/f
      .replace(/(\d)[tTfF](\d)/g, '$1+$2')
      .replace(/[xX]/g, '*')
      .replace(/\s+/g, '')
  );
}

/**
 * @param {number} a
 * @param {string} op
 * @param {number} b
 * @returns {string | null}
 */
function evalOp(a, op, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  let result;
  switch (op) {
    case '+':
      result = a + b;
      break;
    case '-':
      result = a - b;
      break;
    case '*':
      result = a * b;
      break;
    case '/':
      if (b === 0) return null;
      result = a / b;
      break;
    default:
      return null;
  }
  if (!Number.isFinite(result)) return null;
  if (Number.isInteger(result)) return String(result);
  if (Math.abs(result - Math.round(result)) < 1e-9) return String(Math.round(result));
  return String(result);
}

/**
 * @param {string} raw
 * @returns {string | null} 计算结果字符串；无法解析则 null
 */
export function solveMathCaptcha(raw) {
  let text = normalizeOcrNoise(raw);
  if (!text) return null;

  text = text.replace(/^[(\[{]+/, '').replace(/[)\]}]+$/, '');

  /** @type {RegExpMatchArray | null} */
  let match;

  // 1) 标准：6+2=? / 6+2= / 6+2?
  match = text.match(/^(\d{1,3})([+\-*/])(\d{1,3})[=?]/);
  if (match) {
    return evalOp(Number(match[1]), match[2], Number(match[3]));
  }

  // 2) 常见误读：6+27 ← 6+2=?（问号被认成 7/9）
  match = text.match(/^(\d{1,2})([+\-*/])(\d)([79])$/);
  if (match) {
    return evalOp(Number(match[1]), match[2], Number(match[3]));
  }

  // 3) 纯算式：6+2
  match = text.match(/^(\d{1,3})([+\-*/])(\d{1,3})$/);
  if (match) {
    return evalOp(Number(match[1]), match[2], Number(match[3]));
  }

  // 4) 文中夹带运算符：xxx6+2=?xxx
  match = text.match(/(\d{1,3})([+\-*/])(\d{1,3})[=?]/);
  if (match) {
    return evalOp(Number(match[1]), match[2], Number(match[3]));
  }

  match = text.match(/(\d{1,3})([+\-*/])(\d{1,3})/);
  if (match) {
    return evalOp(Number(match[1]), match[2], Number(match[3]));
  }

  return null;
}

/**
 * @param {string} raw
 * @param {{ whitelist?: string, solveMath?: boolean }} settings
 */
export function postProcessOcrText(raw, settings = {}) {
  const normalized = normalizeOcrNoise(raw);
  if (settings.solveMath !== false) {
    const answer = solveMathCaptcha(normalized);
    if (answer != null) return answer;
  }

  const whitelist = settings.whitelist ?? '0-9+\\-*/=?';
  if (!whitelist) return normalized;
  try {
    const re = new RegExp(`[^${whitelist}]`, 'g');
    return normalized.replace(re, '');
  } catch {
    return normalized;
  }
}

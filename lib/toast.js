const TOAST_ID = 'captcha-helper-toast';

/**
 * @param {string} message
 * @param {'info' | 'success' | 'error'} [type]
 */
export function showToast(message, type = 'info') {
  let el = document.getElementById(TOAST_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = TOAST_ID;
    Object.assign(el.style, {
      position: 'fixed',
      top: '16px',
      right: '16px',
      zIndex: '2147483647',
      maxWidth: '360px',
      padding: '10px 14px',
      borderRadius: '8px',
      color: '#fff',
      fontSize: '13px',
      lineHeight: '1.4',
      boxShadow: '0 8px 24px rgba(0,0,0,.18)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      transition: 'opacity .2s ease',
      opacity: '0',
      pointerEvents: 'none',
    });
    document.documentElement.appendChild(el);
  }

  const colors = {
    info: '#3b82f6',
    success: '#16a34a',
    error: '#dc2626',
  };
  el.style.background = colors[type] || colors.info;
  el.textContent = message;
  el.style.opacity = '1';

  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.style.opacity = '0';
  }, 2800);
}

/* Presentation layer for existing tool copy callbacks. No calculation or payload logic. */
(() => {
  if (window.CompuToolsCopyUI) return;
  let lastTarget = null;
  const targetFor = node => node instanceof Element ? node.closest('[data-copy-target="true"], button') : null;
  const announce = (target, success) => {
    if (!target?.isConnected) return;
    target.dataset.copyState = success ? 'copied' : 'failed';
    const root = target.closest('.tool-container');
    const status = root?.querySelector('[data-copy-status]');
    if (status) status.textContent = success ? 'Copied' : 'Copy failed. Please try again.';
    clearTimeout(target._copyTimer);
    target._copyTimer = setTimeout(() => {
      delete target.dataset.copyState;
      if (status) status.textContent = '';
    }, 1800);
  };
  window.CompuToolsCopyUI = {
    capture: () => {
      const target = lastTarget;
      return success => announce(target, success);
    }
  };
  document.addEventListener('click', event => { lastTarget = targetFor(event.target); }, true);
  document.addEventListener('keydown', event => {
    const fileButton = event.target.closest?.('label.tool-file-button');
    if (fileButton && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      (document.getElementById(fileButton.htmlFor) || fileButton.querySelector('input[type="file"]'))?.click();
      return;
    }
    const target = event.target.closest?.('[data-copy-target="true"]');
    if (!target || event.target !== target || !['Enter', ' '].includes(event.key)) return;
    // Editable fields retain their typing/selection behavior.
    if (target.matches('input:not([readonly]),textarea:not([readonly])')) return;
    event.preventDefault();
    target.click();
  });
  let scheduled = false;
  const refresh = () => {
    scheduled = false;
    document.querySelectorAll('.tool-container').forEach(root => {
      const targets = [...root.querySelectorAll('[data-copy-target="true"]')];
      targets.forEach(target => {
        if (!target.hasAttribute('tabindex')) target.tabIndex = 0;
        if (!target.matches('input,textarea,button,a')) target.setAttribute('role', 'button');
        if (!target.hasAttribute('aria-label')) target.setAttribute('aria-label', (target.getAttribute('title') || 'Result') + ': copy');
        if (!target.hasAttribute('title')) target.title = 'Copy result';
      });
      root.querySelectorAll('[data-copy-notice]').forEach(notice => notice.remove());
      if (targets.length && !root.querySelector('[data-copy-status]')) {
        const status = document.createElement('span');
        status.className = 'tool-copy-status-sr';
        status.dataset.copyStatus = 'true';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        root.append(status);
      }
    });
  };
  const schedule = () => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(refresh); }
  };
  const start = () => {
    new MutationObserver(schedule).observe(document.body, {childList: true, subtree: true});
    schedule();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})();

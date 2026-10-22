/* Local layout inspection only. Real AdSense remains production-host restricted. */
(() => {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!local) return;
  const params = new URLSearchParams(location.search);
  const theme = params.get('previewTheme');
  if (['light', 'dark'].includes(theme)) {
    const applyTheme = () => { if (document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme; };
    applyTheme();
    new MutationObserver(applyTheme).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
    window.addEventListener('TrunkApplicationStarted', () => { document.documentElement.dataset.theme = theme; }, {once: true});
  }
  if (params.get('previewAds') !== '1') return;
  const placeholder = (slot, kind) => {
    const el = document.createElement('div');
    el.className = `workspace-ad-preview workspace-ad-preview--${kind}`;
    el.dataset.previewSlot = slot;
    el.textContent = `AD PREVIEW · ${slot}`;
    el.setAttribute('aria-label', `Advertisement placement preview, slot ${slot}`);
    return el;
  };
  let pending = false;
  const refresh = () => {
    pending = false;
    document.querySelectorAll('.tool-workspace-page').forEach(page => {
      const description = page.querySelector('.tool-description');
      if (description && !description.parentElement.querySelector('[data-preview-slot="7315862436"]')) description.after(placeholder('7315862436', 'top'));
      const anchor = page.querySelector('.tool-workspace-ad-anchor');
      if (anchor && !anchor.querySelector('[data-preview-slot]')) anchor.append(placeholder('7541212813', 'internal'));
      const sidebar = page.querySelector('.sidebar-ad-space');
      if (sidebar && !sidebar.querySelector('[data-preview-slot]')) sidebar.append(placeholder('3444624514', 'sidebar'));
    });
  };
  const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(refresh); } };
  const start = () => { new MutationObserver(schedule).observe(document.body, {childList: true, subtree: true}); schedule(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
})();

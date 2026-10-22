/* Browse the existing tool catalog without resizing or moving tool controls. */
(() => {
  let host, dialog, trigger, list, status, rail, railList, groups = [], current = '', lockedOverflow;
  const scrollers = [];
  const node = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  };
  const close = () => { if (dialog?.open) dialog.close(); };
  const createScroller = className => {
    const shell = node('div', 'tool-related-scroll');
    const viewport = node('div', 'tool-related-viewport');
    const content = node('nav', className);
    content.setAttribute('aria-label', 'Related tools');
    content.id = `tool-related-list-${scrollers.length}`;
    const button = direction => {
      const control = node('button', `tool-related-scroll-button tool-related-scroll-${direction}`);
      control.type = 'button';
      control.setAttribute('aria-label', `Scroll related tools ${direction}`);
      control.setAttribute('aria-controls', content.id);
      const chevron = node('span', 'tool-related-chevron');
      chevron.setAttribute('aria-hidden', 'true');
      control.append(chevron);
      control.addEventListener('click', () => {
        const step = Math.max(40, viewport.clientHeight * .75);
        viewport.scrollBy({top: direction === 'up' ? -step : step,
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
      });
      return control;
    };
    const up = button('up'), down = button('down');
    viewport.append(content); shell.append(up, viewport, down);
    const update = () => {
      if (!shell.clientHeight) return;
      shell.classList.toggle('has-overflow', content.scrollHeight > shell.clientHeight + 1);
      const atTop = viewport.scrollTop <= 1;
      const atBottom = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 1;
      up.disabled = atTop; down.disabled = atBottom;
      // Keep keyboard focus available when the clicked control reaches an end.
      if (document.activeElement === up && atTop && !atBottom) down.focus({preventScroll: true});
      if (document.activeElement === down && atBottom && !atTop) up.focus({preventScroll: true});
    };
    viewport.addEventListener('scroll', update, {passive: true});
    shell.addEventListener('wheel', e => {
      // The desktop rail lets wheel input reach the page; the modal contains it.
      if (shell.closest('.tool-explorer-dialog')) e.preventDefault();
    }, {passive: false});
    const observer = new ResizeObserver(update);
    observer.observe(shell); observer.observe(content);
    scrollers.push({update, observer});
    update();
    return {shell, content};
  };
  const link = tool => {
    const a = node('a', 'tool-explorer-link quick-tool-card');
    const info = node('div', 'quick-tool-info'); info.append(node('div', 'quick-tool-name', tool.name));
    a.append(info);
    a.href = tool.href;
    if (tool.href === current) a.setAttribute('aria-current', 'page');
    a.addEventListener('click', e => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) close(); });
    return a;
  };
  // Drawer and desktop rail share composition; each slot remains in its own host.
  const populateRelated = (container, related) => {
    related.forEach((tool, index) => {
      container.append(link(tool));
      if (index === 1 && related.length > 2) {
        const production = window.__compuProductionSite === true;
        const preview = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && new URLSearchParams(location.search).get('previewAds') === '1';
        if (production || preview) {
          const wrapper = node('div', 'tool-related-infeed');
          wrapper.append(node('span', 'tool-related-ad-label', 'Advertisement'));
          if (production) {
            const ins = node('ins', 'compu-ad-slot');
            ins.style.display = 'block';
            ins.dataset.adClient = 'ca-pub-9424100257975478';
            ins.dataset.adSlot = '4515949448';
            ins.dataset.adFormat = 'fluid';
            ins.dataset.adLayoutKey = '-hv-f+2e-23-1h';
            wrapper.append(ins);
          } else {
            wrapper.append(node('div', 'tool-related-infeed-preview', 'In-feed ad preview'));
          }
          container.append(wrapper);
        }
      }
    });
    if (!related.length) container.append(node('p', 'tool-explorer-empty', 'No related tools in this category yet.'));
  };
  const renderRail = related => {
    if (!rail?.isConnected) {
      rail = node('aside', 'tool-related-rail');
      rail.setAttribute('aria-label', 'Related tools');
      const scroller = createScroller('tool-related-list');
      railList = scroller.content;
      rail.append(node('h2', 'home-directory-heading', 'Related Tools'), scroller.shell);
      document.body.append(rail);
    }
    railList.replaceChildren();
    populateRelated(railList, related);
    window.__compuAdLayout?.schedule();
  };
  const render = () => {
    list.replaceChildren();
    const selected = groups.find(g => g.tools.some(t => t.href === current));
    const related = selected ? selected.tools.filter(t => t.href !== current) : [];
    populateRelated(list, related);
    status.textContent = `${related.length} related tools`;
    renderRail(related);

  };
  const create = () => {
    host = node('div', 'tool-explorer-host');
    trigger = node('button', 'tool-explorer-trigger', 'Explore tools');
    trigger.type = 'button';
    trigger.setAttribute('aria-label', 'Explore tools');
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', 'tool-explorer-dialog');
    trigger.setAttribute('aria-expanded', 'false');
    dialog = node('dialog', 'tool-explorer-dialog');
    dialog.id = 'tool-explorer-dialog';
    dialog.setAttribute('aria-labelledby', 'tool-explorer-title');
    const header = node('div', 'tool-explorer-header');
    const dismiss = node('button', 'tool-explorer-close close-btn'); dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Close'); dismiss.title = 'Close';
    const closeIcon = node('i', 'fa-solid fa-times'); closeIcon.setAttribute('aria-hidden', 'true'); dismiss.append(closeIcon);
    const title = node('h2', 'home-directory-heading', 'Related Tools');
    title.id = 'tool-explorer-title';
    dismiss.addEventListener('click', close); header.append(title, dismiss);
    status = node('p', 'tool-copy-status-sr'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const scroller = createScroller('tool-explorer-list');
    list = scroller.content;
    dialog.append(header, status, scroller.shell);
    dialog.addEventListener('click', e => {
      const r = dialog.getBoundingClientRect();
      if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) close();
    });
    dialog.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    });
    dialog.addEventListener('close', () => {
      document.body.style.overflow = lockedOverflow ?? '';
      trigger.setAttribute('aria-expanded', 'false'); trigger.focus({preventScroll: true});
    });
    trigger.addEventListener('click', () => {
      if (dialog.open) { close(); return; }
      lockedOverflow = document.body.style.overflow;
      dialog.showModal(); document.body.style.overflow = 'hidden';
      trigger.setAttribute('aria-expanded', 'true'); dismiss.focus({preventScroll: true});
      scrollers.forEach(s => s.update());
      window.__compuAdLayout?.schedule();
    });
    host.append(trigger, dialog); document.body.append(host);
  };
  const refresh = () => {
    const page = document.querySelector('.tool-workspace-page');
    if (!page) { close(); if (host) host.hidden = true; if (rail) rail.hidden = true; document.body.classList.remove('has-related-rail'); return; }
    const catalog = [...document.querySelectorAll('.site-footer .footer-column')].flatMap(column => {
      const title = column.querySelector('.footer-column-title');
      const tools = [...column.querySelectorAll('.footer-links a')].filter(a => /^\/[\w-]+\/$/.test(a.getAttribute('href')) && !['/blog/','/about/','/contact/','/privacy/','/terms/'].includes(a.getAttribute('href'))).map(a => ({name: a.textContent.trim(), href: a.getAttribute('href')}));
      return title && tools.length ? [{name: title.textContent.trim(), tools}] : [];
    });
    if (!catalog.length) return;
    const route = `/${page.dataset.toolRoute}/`;
    if (!host?.isConnected) { create(); current = ''; }
    if (route !== current) { close(); current = route; groups = catalog; render(); }
    host.hidden = !!document.fullscreenElement;
    rail.hidden = !!document.fullscreenElement;
    document.body.classList.toggle('has-related-rail', !document.fullscreenElement);
    if (innerWidth >= 1600) close();
    scrollers.forEach(s => s.update());
    window.__compuAdLayout?.schedule();
  };
  let pending = false;
  const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; refresh(); }); } };
  const start = () => {
    new MutationObserver(records => {
      if (records.some(r => !host?.contains(r.target) && !rail?.contains(r.target) && r.target !== document.body)) schedule();
    }).observe(document.body, {childList: true, subtree: true});
    window.addEventListener('resize', schedule, {passive: true});
    document.addEventListener('fullscreenchange', schedule);
    window.addEventListener('TrunkApplicationStarted', schedule);
    schedule();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
})();

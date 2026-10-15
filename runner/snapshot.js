(() => {
  if (!document.body) return null;
  const cache = window.__jevFast ||= { ids: new WeakMap(), nodes: new Map(), next: 1 };
  const identity = e => {
    if (!cache.ids.has(e)) cache.ids.set(e, cache.next++);
    const id = cache.ids.get(e);
    cache.nodes.set(id, e);
    return id;
  };
  for (const [id, e] of cache.nodes) if (!e.isConnected) cache.nodes.delete(id);
  const safe = e => !['password', 'file', 'hidden'].includes(e.type);
  const visible = e => !e.closest('[aria-hidden="true"],[inert]') && (e.checkVisibility ? e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : (e.offsetWidth > 0 && e.offsetHeight > 0));

  const name = (e, seen = new Set()) => {
    if (!e || seen.has(e)) return '';
    seen.add(e);
    const referenced = (e.getAttribute('aria-labelledby') || '').split(/\s+/)
      .map(id => name(document.getElementById(id), seen)).filter(Boolean).join(' ');
    return referenced || e.getAttribute('aria-label') ||
      [...(e.labels || [])].map(l => name(l, seen)).filter(Boolean).join(' ') ||
      (['button', 'submit', 'reset'].includes(e.type) ? e.value : '') ||
      e.getAttribute('alt') ||
      (e.tagName === 'INPUT' ? '' : [...e.childNodes].map(n => n.nodeType === 3 ? n.textContent : n.nodeType === 1 && n.getAttribute('aria-hidden') !== 'true' ? name(n, seen) : '').join(' ').trim()) ||
      e.getAttribute('title') || e.getAttribute('placeholder') || '';
  };

  const roles = ['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'option', 'combobox', 'textbox', 'searchbox'];
  const selector = 'a[href],button,input,textarea,select,summary,[contenteditable="true"],' + roles.map(r => '[role="' + r + '"]').join(',');

  const role = e => {
    const explicit = e.getAttribute('role');
    if (roles.includes(explicit)) return explicit;
    if (e.tagName === 'BUTTON' || e.tagName === 'SUMMARY') return 'button';
    if (e.tagName === 'A') return 'link';
    if (e.tagName === 'SELECT') return 'combobox';
    if (e.tagName === 'TEXTAREA' || e.isContentEditable) return 'textbox';
    if (e.tagName === 'INPUT') {
      if (['checkbox', 'radio'].includes(e.type)) return e.type;
      if (['button', 'submit', 'reset', 'image'].includes(e.type)) return 'button';
      if (e.type === 'search') return 'searchbox';
      if (['text', 'email', 'url', 'tel', 'number'].includes(e.type)) return 'textbox';
    }
    return null;
  };

  const actions = [];
  for (const e of document.querySelectorAll(selector)) {
    if (!safe(e) || !visible(e) || e.matches(':disabled') || e.closest('[aria-disabled="true"]')) continue;
    const r = e.getBoundingClientRect();
    const rname = role(e);
    if (!rname || r.width <= 0 || r.height <= 0 || r.bottom < 0 || r.top > window.innerHeight) continue;

    const base = {
      node: identity(e),
      role: rname,
      label: (name(e) || rname).slice(0, 100),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    };

    const editable = !e.readOnly && (['textbox', 'searchbox'].includes(rname) || e.isContentEditable || (rname === 'combobox' && ['INPUT', 'TEXTAREA'].includes(e.tagName)));
    const value = 'value' in e ? String(e.value) : (e.isContentEditable ? e.innerText.trim() : '');
    actions.push({
      ...base,
      kind: editable ? 'fill' : 'click',
      value: value.slice(0, 100)
    });
  }

  actions.splice(60); // Cap at top 60 visible actionable items
  actions.forEach((a, i) => a.id = 'e' + (i + 1));

  return {
    url: location.href,
    title: document.title,
    actions
  };
})()

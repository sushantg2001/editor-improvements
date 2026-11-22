// A minimal router for checking facts about Obsidian in a live instance. It is not the plugin's router.
(() => {
  if (window.__R) return 'already';
  const km = app.keymap, Scope = app.scope.constructor;
  const R = window.__R = { log: [], maps: new Map(), strict: true, scope: new Scope(null), saved: null, wins: new Set() };
  const note = (s) => R.log.push(s);
  const notation = (e) => {
    let k = e.key; if (['Control','Shift','Alt','Meta'].includes(k)) return null;
    if (k.length === 1) k = k.toLowerCase();
    return (e.ctrlKey ? 'C-' : '') + (e.altKey ? 'A-' : '') + (e.metaKey ? 'M-' : '') + (e.shiftKey && k.length > 1 ? 'S-' : '') + k;
  };
  const below = (win) => { const st = km.getWindowStack(win); return st.prevScopes[st.prevScopes.length - 1]; };
  R.context = (e) => {
    const win = e.view || window;
    const t = e.target;
    if (below(win) !== app.workspace.scope) return 'transient';
    if (t && t.closest && t.closest('.cm-editor')) return 'editor';
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return 'input';
    return 'global';
  };
  R.scope.register(null, null, (e) => {
    const t0 = performance.now();
    try {
      if (e.isComposing || e.keyCode === 229 || e.key === 'Process' || e.key === 'Unidentified' || e.key === 'Dead') return undefined;
      const n = notation(e); if (!n) return undefined;
      const ctx = R.context(e);
      const fn = R.maps.get(ctx + ' ' + n) || R.maps.get('global ' + n);
      if (fn) { note('mapped ' + ctx + ' ' + n); fn(e); return false; }
      const chord = e.ctrlKey || e.altKey || e.metaKey;
      if (R.strict && chord && (ctx === 'global' || (ctx === 'editor' && isInsert(e)))) { note('strict swallow ' + ctx + ' ' + n); return false; }
      note('fallthrough ' + ctx + ' ' + n);
      return undefined;
    } finally { R.lastCost = performance.now() - t0; (R.costs ||= []).push(R.lastCost); }
  });
  const isInsert = (e) => { const ed = app.workspace.activeEditor?.editor; const v = ed?.cm?.cm?.state?.vim; return !v || v.insertMode; };
  // keep the router on top of a given window's stack
  R.sync = (win) => {
    const st = km.getWindowStack(win);
    if (st.scope !== R.scope) { let i; while ((i = st.prevScopes.indexOf(R.scope)) >= 0) st.prevScopes.splice(i, 1); st.prevScopes.push(st.scope); st.scope = R.scope; }
    R.scope.parent = st.prevScopes[st.prevScopes.length - 1] || null;
  };
  R.origPush = km.pushScope.bind(km); R.origPop = km.popScope.bind(km);
  km.pushScope = (s) => { R.origPush(s); if (s !== R.scope) R.sync(activeWindow); };
  km.popScope = (s) => { R.origPop(s); R.sync(s && s.win ? s.win : activeWindow); };
  R.install = (win) => { R.wins.add(win); R.sync(win); };
  R.takeover = () => { const k = app.scope.keys.findIndex(x => x.key === null && x.modifiers === null); if (k < 0) return 'no entry'; R.saved = app.scope.keys.splice(k, 1)[0]; return 'taken over'; };
  R.restore = () => { if (R.saved) { app.scope.keys.unshift(R.saved); R.saved = null; } km.pushScope = R.origPush; km.popScope = R.origPop; for (const w of R.wins) { const st = km.getWindowStack(w); if (st.scope === R.scope) { st.scope = st.prevScopes.pop() || app.scope; } let i; while ((i = st.prevScopes.indexOf(R.scope)) >= 0) st.prevScopes.splice(i, 1); } delete window.__R; return 'restored'; };
  return 'installed';
})()

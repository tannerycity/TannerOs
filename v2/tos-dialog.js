/* TannerOS · Diálogos con marca (reemplazo de confirm/alert nativos)
   Uso:
     const ok = await window.tosConfirm({ kicker:'CAPTACIÓN', title:'Convertir a Tanner',
       message:'…', confirmText:'Sí, convertir', cancelText:'Cancelar', danger:false });
     await window.tosAlert({ title:'Listo', message:'Se guardó.' });
   También acepta un string: await tosConfirm('¿Seguro?') */
(function () {
  if (window.tosConfirm) return;

  function ensureStyles() {
    if (document.getElementById('tos-dialog-styles')) return;
    var s = document.createElement('style');
    s.id = 'tos-dialog-styles';
    s.textContent =
      '.tosdlg-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(11,20,24,.55);display:grid;place-items:center;padding:18px;animation:tosdlgFade .12s ease}' +
      '@keyframes tosdlgFade{from{opacity:0}to{opacity:1}}' +
      '.tosdlg{background:#fff;border-radius:22px;width:min(420px,100%);box-shadow:0 24px 70px rgba(0,0,0,.34);overflow:hidden;font-family:inherit;animation:tosdlgPop .16s cubic-bezier(.2,.9,.3,1.2)}' +
      '@keyframes tosdlgPop{from{transform:scale(.94);opacity:.6}to{transform:scale(1);opacity:1}}' +
      '.tosdlg-head{display:flex;align-items:center;gap:11px;padding:20px 22px 0}' +
      '.tosdlg-mark{width:38px;height:38px;border-radius:11px;background:#0b1418;color:#c6ac5c;display:grid;place-items:center;font-weight:900;font-size:19px;flex:0 0 auto;overflow:hidden}' +
      '.tosdlg-mark img{width:100%;height:100%;object-fit:contain}' +
      '.tosdlg-kicker{font-size:10px;font-weight:900;letter-spacing:.08em;color:#8a969b;text-transform:uppercase}' +
      '.tosdlg-body{padding:13px 22px 4px}' +
      '.tosdlg-title{font-size:20px;font-weight:800;color:#0b1418;margin:0 0 6px;line-height:1.18}' +
      '.tosdlg-msg{font-size:14.5px;color:#4a5a60;line-height:1.5;margin:0}' +
      '.tosdlg-actions{display:flex;gap:10px;padding:18px 22px 22px}' +
      '.tosdlg-btn{flex:1;border:0;border-radius:14px;padding:14px;font:inherit;font-weight:800;font-size:15px;cursor:pointer;transition:filter .1s,transform .08s}' +
      '.tosdlg-btn:active{transform:scale(.98)}' +
      '.tosdlg-cancel{background:#eef2f1;color:#0b1418}' +
      '.tosdlg-cancel:hover{filter:brightness(.97)}' +
      '.tosdlg-ok{background:#087d8e;color:#fff}' +
      '.tosdlg-ok:hover{filter:brightness(1.05)}' +
      '.tosdlg-ok.danger{background:#d23829}' +
      '.tosdlg-field{width:100%;box-sizing:border-box;margin-top:13px;border:1px solid #cedbd8;border-radius:13px;padding:13px 14px;font:inherit;font-size:15px;color:#0b1418;background:#fff;outline:none}' +
      '.tosdlg-field:focus{border-color:#087d8e;box-shadow:0 0 0 3px rgba(8,125,142,.14)}' +
      '.tosdlg-field.bad{border-color:#d23829;box-shadow:0 0 0 3px rgba(210,56,41,.12)}' +
      '.tosdlg-hint{margin:8px 0 0;font-size:11.5px;color:#8a969b;line-height:1.4}' +
      '.tosdlg-req{margin:8px 0 0;font-size:12px;font-weight:800;color:#d23829;min-height:15px}';
    document.head.appendChild(s);
  }

  function open(o) {
    ensureStyles();
    o = (typeof o === 'string') ? { message: o } : (o || {});
    return new Promise(function (resolve) {
      var back = document.createElement('div'); back.className = 'tosdlg-backdrop';
      var dlg = document.createElement('div'); dlg.className = 'tosdlg';

      var head = document.createElement('div'); head.className = 'tosdlg-head';
      var mark = document.createElement('span'); mark.className = 'tosdlg-mark'; mark.textContent = 'T';
      // si la app ya cargó un logo de marca, reúsalo
      var brandImg = document.querySelector('.tos-brand-mark img, .brand-mark img');
      if (brandImg && brandImg.src) { var im = document.createElement('img'); im.src = brandImg.src; im.alt = ''; mark.textContent = ''; mark.appendChild(im); }
      head.appendChild(mark);
      var kick = document.createElement('span'); kick.className = 'tosdlg-kicker';
      kick.textContent = o.kicker || 'TANNEROS'; head.appendChild(kick);

      var body = document.createElement('div'); body.className = 'tosdlg-body';
      var h = document.createElement('h3'); h.className = 'tosdlg-title';
      h.textContent = o.title || '¿Confirmar?'; body.appendChild(h);
      if (o.message) { var p = document.createElement('p'); p.className = 'tosdlg-msg'; p.textContent = o.message; body.appendChild(p); }

      // Campo de texto: es lo que convierte este diálogo en el reemplazo de prompt().
      var field = null, req = null;
      if (o.prompt) {
        field = document.createElement(o.multiline ? 'textarea' : 'input');
        field.className = 'tosdlg-field';
        if (o.multiline) field.rows = 3; else field.type = 'text';
        if (o.placeholder) field.placeholder = o.placeholder;
        if (o.maxlength) field.maxLength = o.maxlength;
        field.value = o.value == null ? '' : String(o.value);
        body.appendChild(field);
        if (o.hint) { var hi = document.createElement('p'); hi.className = 'tosdlg-hint'; hi.textContent = o.hint; body.appendChild(hi); }
        req = document.createElement('p'); req.className = 'tosdlg-req'; body.appendChild(req);
      }

      var acts = document.createElement('div'); acts.className = 'tosdlg-actions';

      // Cancelar siempre devuelve null en modo prompt (como el nativo) y false en confirm,
      // para que quien ya distinguía "canceló" de "dijo que no" no cambie de comportamiento.
      function done(v) { document.removeEventListener('keydown', onKey); back.remove(); resolve(v); }
      function cancelar() { done(o.prompt ? null : false); }
      function aceptar() {
        if (!field) return done(true);
        var val = field.value.trim();
        if (o.required && !val) {
          req.textContent = o.requiredText || 'Esto no puede ir vacío.';
          field.classList.add('bad'); field.focus();
          return;
        }
        done(val);
      }
      function onKey(ev) {
        if (ev.key === 'Escape') return cancelar();
        // En un textarea Enter escribe salto de línea; solo confirma con Ctrl/Cmd+Enter.
        if (ev.key === 'Enter' && (!o.multiline || ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); aceptar(); }
      }
      if (field) field.addEventListener('input', function () { req.textContent = ''; field.classList.remove('bad'); });

      if (o.showCancel !== false) {
        var c = document.createElement('button'); c.type = 'button';
        c.className = 'tosdlg-btn tosdlg-cancel'; c.textContent = o.cancelText || 'Cancelar';
        c.onclick = cancelar; acts.appendChild(c);
      }
      var ok = document.createElement('button'); ok.type = 'button';
      ok.className = 'tosdlg-btn tosdlg-ok' + (o.danger ? ' danger' : ''); ok.textContent = o.confirmText || 'Aceptar';
      ok.onclick = aceptar; acts.appendChild(ok);

      dlg.appendChild(head); dlg.appendChild(body); dlg.appendChild(acts); back.appendChild(dlg);
      back.onclick = function (e) { if (e.target === back && o.showCancel !== false) cancelar(); };
      document.addEventListener('keydown', onKey);
      document.body.appendChild(back);
      setTimeout(function () { (field || ok).focus(); if (field) field.select(); }, 50);
    });
  }

  window.tosConfirm = function (o) {
    return open(Object.assign({ showCancel: true, title: '¿Confirmar?' }, typeof o === 'string' ? { message: o } : o));
  };
  window.tosAlert = function (o) {
    return open(Object.assign({ showCancel: false, title: 'Aviso' }, typeof o === 'string' ? { message: o } : o));
  };
  // Reemplazo de prompt(): devuelve el texto, o null si se cancela.
  window.tosPrompt = function (o) {
    return open(Object.assign({ showCancel: true, prompt: true, title: 'Escribe' },
      typeof o === 'string' ? { title: o } : o));
  };
})();

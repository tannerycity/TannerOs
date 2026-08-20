const cashIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M7 7V4h10v3"/><path d="M7 12h4"/><path d="M15 12h2"/><path d="M7 16h10"/></svg>';

function moduleRow(navigation,code){return (navigation||[]).find(r=>r.module_code===code);}
function readable(navigation,code){const r=moduleRow(navigation,code);return Boolean(r?.enabled&&r?.can_read);}

function ensureFinanceSection(nav){
  let section=nav.querySelector('.tos-nav-section-finance');
  if(section)return section;
  section=document.createElement('div');section.className='tos-nav-section tos-nav-section-finance';
  const label=document.createElement('div');label.className='tos-nav-section-label';label.textContent='Finanzas';section.appendChild(label);
  const ops=nav.querySelector('.tos-nav-section-ops,.tos-nav-section-admin');
  if(ops)nav.insertBefore(section,ops);else nav.appendChild(section);
  return section;
}
function installCashierNavigation(navigation){
  if(!readable(navigation,'taquilla'))return;
  const nav=document.getElementById('sidebarNav')||document.getElementById('tosExperienceNav');
  if(!nav||nav.querySelector('[data-module="taquilla"]'))return;
  const section=ensureFinanceSection(nav),a=document.createElement('a');
  a.href='/v2/taquilla/';a.dataset.module='taquilla';a.className=`tos-nav-item ${location.pathname.startsWith('/v2/taquilla/')?'active':''}`;
  a.innerHTML=`<span class="tos-nav-icon">${cashIcon}</span><span>Taquilla</span>`;
  section.prepend(a);
}
function installSearchExtension(navigation){
  if(!readable(navigation,'taquilla'))return;
  const current=Array.isArray(window.__tosSearchExtras)?window.__tosSearchExtras:[];
  if(current.some(r=>r.href==='/v2/taquilla/'))return;
  window.__tosSearchExtras=[...current,{label:'Abrir Taquilla',meta:'Caja · cobrar · pagar · corte · efectivo · movimientos',href:'/v2/taquilla/'}];
  window.dispatchEvent(new CustomEvent('tanneros:search-extras',{detail:window.__tosSearchExtras}));
}
function upgradeFinanceCard(){
  if(!location.pathname.startsWith('/v2/finanzas/'))return;
  const update=()=>{
    const links=[...document.querySelectorAll('a.tos-hub-card')],card=links.find(a=>/Taquilla\s*\/\s*operación/i.test(a.textContent));
    if(!card)return false;card.href='/v2/taquilla/';
    const desc=card.querySelector('span:not(.tos-hub-icon)');if(desc)desc.textContent='Caja, cobros, egresos y corte';
    return true;
  };
  if(update())return;
  const observer=new MutationObserver(()=>{if(update())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),5000);
}

export function installProductExtensions({navigation}){
  installCashierNavigation(navigation);installSearchExtension(navigation);upgradeFinanceCard();
  const observer=new MutationObserver(()=>installCashierNavigation(navigation));observer.observe(document.body,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),6000);
}

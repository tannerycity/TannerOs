const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-MX').trim();
const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const idSelectors=id=>[
  'player-id','prospect-id','order-id','sponsor-id','program-id','match-id','academy-id','event-id','report-id','batch-id'
].map(name=>`[data-${name}="${CSS.escape(id)}"]`).join(',');

function activate(el){
  if(!el)return false;
  const target=el.matches?.('button,a,[role="button"]')?el:(el.querySelector?.('button,a,[role="button"]')||el);
  el.scrollIntoView?.({behavior:'smooth',block:'center'});
  target.click?.();
  el.classList?.add('tos-focus-pulse');
  setTimeout(()=>el.classList?.remove('tos-focus-pulse'),1400);
  return true;
}

function findById(id){return document.querySelector(idSelectors(id));}
function findByTitle(title){
  const q=normalize(title);if(!q)return null;
  const candidates=[...document.querySelectorAll('.profile-row,.prospect-row,.order-row,.sponsor-row,.program-row,.academy-row,.match-row,.callup-match-row,.scout-row,article button,article[role="button"],button')]
    .filter(el=>normalize(el.textContent).includes(q));
  candidates.sort((a,b)=>normalize(a.textContent).length-normalize(b.textContent).length);
  return candidates[0]||null;
}

export async function initFocusFallback({supabase,ctx}){
  const id=new URLSearchParams(location.search).get('focus');
  if(!id||!uuidRe.test(id)||!supabase||!ctx?.organization_id)return;
  if(activate(findById(id)))return;

  let title='';
  try{
    const {data,error}=await supabase.rpc('v2_entity_focus',{organization_id:ctx.organization_id,entity_id:id});
    if(error)throw error;
    title=data?.[0]?.title||'';
  }catch(e){console.warn('focus resolver',e);return;}
  if(!title)return;

  const tryFocus=()=>activate(findById(id)||findByTitle(title));
  if(tryFocus())return;
  const observer=new MutationObserver(()=>{if(tryFocus())observer.disconnect();});
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(()=>observer.disconnect(),6000);
}

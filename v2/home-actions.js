import {supabase,rpc,$,setShellHealth} from '/v2/shell.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const priorityLabel={critical:'Urgente',attention:'Atención',info:'Seguimiento'};

function render(data){
  const list=$('attentionList');if(!list)return;
  const items=Array.isArray(data?.items)?data.items:[];
  if(!items.length){list.innerHTML='<article class="tos-alert good"><span class="tos-alert-tag">Bien</span><b>Todo en orden</b><small>No hay pendientes visibles para los módulos de tu rol.</small></article>';setShellHealth({state:'ok',label:'Todo en orden'});return;}
  list.innerHTML=items.slice(0,8).map(item=>`<a class="tos-action-alert ${esc(item.priority||'info')}" href="${esc(item.href||'/v2/')}"><span class="tos-alert-tag">${esc(priorityLabel[item.priority]||'Seguimiento')}</span><div><b>${esc(item.title||'Pendiente')}${Number(item.count||0)>0?` <em>${Number(item.count)}</em>`:''}</b><small>${esc(item.detail||'Abrir para revisar')}</small></div><span class="tos-action-arrow">›</span></a>`).join('');
  const critical=Number(data?.summary?.critical||0),attention=Number(data?.summary?.attention||0);
  setShellHealth(critical?{state:'danger',label:`${critical} urgente${critical===1?'':'s'}`} : attention?{state:'attention',label:`${attention} por atender`}:{state:'ok',label:'Todo en orden'});
}

async function boot(){
  try{
    const {data:{session}}=await supabase.auth.getSession();if(!session)return;
    const rows=await rpc('v2_my_context');if(!rows?.length)return;
    const data=await rpc('v2_action_center',{organization_id:rows[0].organization_id});
    render(data);
  }catch(e){console.warn('action center',e);}
}

const wait=()=>{if($('attentionList')&&document.querySelector('#appView:not(.hidden)'))boot();else setTimeout(wait,220);};
wait();

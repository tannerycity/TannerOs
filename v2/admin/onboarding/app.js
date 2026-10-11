import {bootstrapProtectedShell,rpc,$,setShellHealth} from '/v2/shell.js';
import {ligaPublica} from '/v2/club-publico.js';
import {nombreDelClub} from '/v2/club.js';
const boot=await bootstrapProtectedShell({active:'admin',title:'Primeros pasos'});if(!boot)throw new Error('No access');const {ctx}=boot,org=ctx.organization_id;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=s=>s==='ready'?'tos-icon-check':s==='blocker'?'tos-icon-close':'tos-icon-search';const label=s=>s==='ready'?'Listo':s==='blocker'?'Necesario':'Pendiente';
// Los pasos van en el orden en que el dueño los hace; el primero que falta se
// marca como "Siguiente" y su botón es el que llama la atención.
function render(data){
  const pct=Number(data?.percent||0),checks=data?.checks||[];
  $('readinessPercent').textContent=`${pct}%`;$('readinessBar').style.width=`${Math.max(0,Math.min(100,pct))}%`;
  $('readinessText').textContent=`${data?.ready||0} de ${data?.total||0} pasos listos`;
  const siguiente=checks.findIndex(c=>c.status!=='ready');
  $('checkList').innerHTML=checks.map((c,i)=>`<a href="${esc(c.href||'#')}" class="onboarding-check ${esc(c.status||'warning')}${i===siguiente?' siguiente':''}" data-code="${esc(c.code)}">
    <span class="check-icon"><span class="check-num">${i+1}</span><i class="tos-icon ${icon(c.status)}" aria-hidden="true"></i></span>
    <div><strong>${esc(c.label)}</strong><p>${esc(c.detail||'')}</p></div>
    <span class="check-status">${i===siguiente?'Siguiente':label(c.status)}</span>
    <span class="check-cta">${c.status==='ready'?'Ver':esc(c.cta||'Abrir')}</span></a>`).join('');
  setShellHealth({state:pct>=100?'ok':'attention',label:pct>=100?'Club listo':`${data?.ready||0}/${data?.total||0} pasos`});
}
render(await rpc('v2_onboarding_readiness',{organization_id:org}));

// La liga de registro del club, para el grupo de WhatsApp de las familias.
const liga=ligaPublica('/registro/',ctx);
$('ligaTexto').textContent=liga;
$('ligaWa').href=`https://wa.me/?text=${encodeURIComponent(`Registra a tu hijo en ${nombreDelClub(ctx)}: ${liga}`)}`;
$('ligaCopiar').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(liga);$('ligaCopiar').textContent='Copiada';}catch{$('ligaCopiar').textContent='Cópiala de arriba';}setTimeout(()=>{$('ligaCopiar').textContent='Copiar liga';},2000);});
$('ligaCard').classList.remove('hidden');

import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function rpc(name,params={}){const {data,error}=await supabase.rpc(name,params);if(error)throw error;return data;}
function show(id){['loadingView','deniedView','view'].forEach(view=>$(view)?.classList.toggle('hidden',view!==id));}

const CATEGORIES=['inscripcion','mensualidades','becas','entrenamientos','asistencia','partidos','uniformes','baby_tanners','jugadores','familias','conducta','seguridad','salud','tanner_os','estacionamiento','tannery_city_park','privacidad','faq'];

let orgId=null, canWrite=false, data={policies:[],faqs:[],documents:[],changes:[],searchMisses:[]}, activeTab='policies';

async function loadAll(){ data=await rpc('v2_centro_tanner_admin_list',{organization_id:orgId,status_filter:null}); }

function msg(text,type='error'){return text?`<p class="ct-msg" data-type="${type}">${esc(text)}</p>`:'';}

function renderTabs(){
  document.querySelectorAll('.ct-tab').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.tab===activeTab);
    btn.onclick=()=>{activeTab=btn.dataset.tab;renderPanel();};
  });
}

function renderPanel(){
  renderTabs();
  const panel=$('ctPanel');
  if(activeTab==='policies')return renderPolicies(panel);
  if(activeTab==='faqs')return renderFaqs(panel);
  if(activeTab==='documents')return renderDocuments(panel);
  if(activeTab==='changes')return renderChanges(panel);
  if(activeTab==='acceptance')return renderAcceptance(panel);
  if(activeTab==='misses')return renderMisses(panel);
}

/* ---------------- Políticas ---------------- */
function policyForm(p){
  const id=p?.id||'';
  return `<form class="ct-form" id="policyForm" data-id="${esc(id)}">
    <div class="ct-form-grid">
      <label>Código<input name="policyCode" value="${esc(p?.policyCode||'')}" required></label>
      <label>Slug (URL)<input name="slug" value="${esc(p?.slug||'')}" required pattern="[a-z0-9-]+"></label>
    </div>
    <label>Título<input name="title" value="${esc(p?.title||'')}" required></label>
    <div class="ct-form-grid">
      <label>Categoría<select name="category" required>${CATEGORIES.map(c=>`<option value="${c}" ${p?.category===c?'selected':''}>${c}</option>`).join('')}</select></label>
      <label>Ámbito<select name="scope"><option value="tannery_city" ${(!p||p.scope==='tannery_city')?'selected':''}>Tannery City</option><option value="tannery_city_park" ${p?.scope==='tannery_city_park'?'selected':''}>Tannery City Park</option><option value="torneos_tcp" ${p?.scope==='torneos_tcp'?'selected':''}>Torneos TCP</option></select></label>
    </div>
    <label>Respuesta corta<textarea name="shortAnswer" required>${esc(p?.shortAnswer||'')}</textarea></label>
    <label>Política completa<textarea name="officialContent" rows="8" required>${esc(p?.officialContent||'')}</textarea></label>
    <label>Palabras clave (separadas por coma)<input name="keywords" value="${esc((p?.keywords||[]).join(', '))}"></label>
    <div class="ct-form-grid">
      <label class="ct-check"><input type="checkbox" name="requiresAcceptance" ${p?.requiresAcceptance?'checked':''}> Requiere aceptación de familias</label>
      <label>Fecha de vigencia<input type="date" name="effectiveDate" value="${p?.effectiveDate||''}"></label>
    </div>
    ${msg('')}<div class="ct-row-actions"><button class="ct-btn primary" type="submit">Guardar borrador</button><button class="ct-btn" type="button" id="policyCancel">Cancelar</button></div>
  </form>`;
}

function renderPolicies(panel){
  panel.innerHTML=`${canWrite?`<button class="ct-btn primary" id="newPolicy" type="button">+ Nueva política</button>`:''}
    <div id="policyFormWrap"></div>
    ${data.policies.length?data.policies.map(p=>`
      <article class="ct-row">
        <div class="ct-row-head"><div class="ct-row-title">${esc(p.title)}</div><span class="ct-badge" data-status="${esc(p.status)}">${esc(p.status)}</span></div>
        <div class="ct-row-meta">${esc(p.policyCode)} · ${esc(p.category)} · v${esc(p.version)}${p.requiresAcceptance?' · requiere aceptación':''}</div>
        <div class="ct-row-meta">${esc(p.shortAnswer)}</div>
        ${canWrite?`<div class="ct-row-actions">
          <button class="ct-btn" data-edit="${esc(p.id)}" type="button">Editar</button>
          ${p.status!=='published'?`<button class="ct-btn primary" data-publish="${esc(p.id)}" type="button">Publicar</button>`:''}
          ${p.status!=='archived'?`<button class="ct-btn danger" data-archive="${esc(p.id)}" type="button">Archivar</button>`:''}
        </div>`:''}
      </article>`).join(''):'<div class="ct-empty">Todavía no hay políticas.</div>'}`;

  if(!canWrite)return;
  $('newPolicy')?.addEventListener('click',()=>{$('policyFormWrap').innerHTML=policyForm(null);wirePolicyForm();});
  panel.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',()=>{
    const p=data.policies.find(x=>x.id===btn.dataset.edit);
    $('policyFormWrap').innerHTML=policyForm(p);wirePolicyForm();
  }));
  panel.querySelectorAll('[data-publish]').forEach(btn=>btn.addEventListener('click',async()=>{
    btn.disabled=true;try{await rpc('v2_centro_tanner_policy_publish',{organization_id:orgId,policy_id:btn.dataset.publish});await loadAll();renderPanel();}catch(e){alert(e.message||'No se pudo publicar.');btn.disabled=false;}
  }));
  panel.querySelectorAll('[data-archive]').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!confirm('¿Archivar esta política? Dejará de verse en el sitio público.'))return;
    btn.disabled=true;try{await rpc('v2_centro_tanner_policy_archive',{organization_id:orgId,policy_id:btn.dataset.archive});await loadAll();renderPanel();}catch(e){alert(e.message||'No se pudo archivar.');btn.disabled=false;}
  }));
}
function wirePolicyForm(){
  $('policyCancel').addEventListener('click',()=>{$('policyFormWrap').innerHTML='';});
  $('policyForm').addEventListener('submit',async e=>{
    e.preventDefault();const f=e.target,btn=f.querySelector('button[type="submit"]');btn.disabled=true;
    const fd=new FormData(f);
    try{
      await rpc('v2_centro_tanner_policy_upsert',{
        organization_id:orgId, id:f.dataset.id||null,
        policy_code:fd.get('policyCode'), slug:fd.get('slug'), title:fd.get('title'),
        category:fd.get('category'), scope:fd.get('scope'), short_answer:fd.get('shortAnswer'),
        official_content:fd.get('officialContent'),
        keywords:fd.get('keywords').split(',').map(k=>k.trim()).filter(Boolean),
        requires_acceptance:fd.get('requiresAcceptance')==='on',
        consent_document_code:null, effective_date:fd.get('effectiveDate')||null
      });
      $('policyFormWrap').innerHTML='';await loadAll();renderPanel();
    }catch(err){f.insertAdjacentHTML('beforeend',msg(err.message||'No se pudo guardar.'));btn.disabled=false;}
  });
}

/* ---------------- FAQ ---------------- */
function faqForm(f){
  return `<form class="ct-form" id="faqForm" data-id="${esc(f?.id||'')}">
    <label>Pregunta<input name="question" value="${esc(f?.question||'')}" required></label>
    <label>Respuesta<textarea name="answer" required>${esc(f?.answer||'')}</textarea></label>
    <div class="ct-form-grid">
      <label>Política relacionada<select name="policyId"><option value="">— Ninguna —</option>${data.policies.map(p=>`<option value="${esc(p.id)}" ${f?.policyId===p.id?'selected':''}>${esc(p.title)}</option>`).join('')}</select></label>
      <label>Categoría<select name="category">${CATEGORIES.map(c=>`<option value="${c}" ${f?.category===c?'selected':''}>${c}</option>`).join('')}</select></label>
    </div>
    <div class="ct-form-grid">
      <label>Orden<input type="number" name="sortOrder" value="${f?.sortOrder??0}"></label>
      <label>Estado<select name="status"><option value="published" ${(!f||f.status==='published')?'selected':''}>Publicada</option><option value="draft" ${f?.status==='draft'?'selected':''}>Borrador</option><option value="archived" ${f?.status==='archived'?'selected':''}>Archivada</option></select></label>
    </div>
    ${msg('')}<div class="ct-row-actions"><button class="ct-btn primary" type="submit">Guardar</button><button class="ct-btn" type="button" id="faqCancel">Cancelar</button></div>
  </form>`;
}
function renderFaqs(panel){
  panel.innerHTML=`${canWrite?`<button class="ct-btn primary" id="newFaq" type="button">+ Nueva FAQ</button>`:''}
    <div id="faqFormWrap"></div>
    ${data.faqs.length?data.faqs.map(f=>`
      <article class="ct-row">
        <div class="ct-row-head"><div class="ct-row-title">${esc(f.question)}</div><span class="ct-badge" data-status="${esc(f.status)}">${esc(f.status)}</span></div>
        <div class="ct-row-meta">${esc(f.answer)}</div>
        ${canWrite?`<div class="ct-row-actions"><button class="ct-btn" data-edit="${esc(f.id)}" type="button">Editar</button></div>`:''}
      </article>`).join(''):'<div class="ct-empty">Todavía no hay FAQ.</div>'}`;
  if(!canWrite)return;
  $('newFaq')?.addEventListener('click',()=>{$('faqFormWrap').innerHTML=faqForm(null);wireFaqForm();});
  panel.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',()=>{
    const f=data.faqs.find(x=>x.id===btn.dataset.edit);$('faqFormWrap').innerHTML=faqForm(f);wireFaqForm();
  }));
}
function wireFaqForm(){
  $('faqCancel').addEventListener('click',()=>{$('faqFormWrap').innerHTML='';});
  $('faqForm').addEventListener('submit',async e=>{
    e.preventDefault();const f=e.target,btn=f.querySelector('button[type="submit"]');btn.disabled=true;const fd=new FormData(f);
    try{
      await rpc('v2_centro_tanner_faq_upsert',{
        organization_id:orgId, id:f.dataset.id||null, policy_id:fd.get('policyId')||null,
        question:fd.get('question'), answer:fd.get('answer'), category:fd.get('category'),
        keywords:[], sort_order:Number(fd.get('sortOrder')||0), status:fd.get('status')
      });
      $('faqFormWrap').innerHTML='';await loadAll();renderPanel();
    }catch(err){f.insertAdjacentHTML('beforeend',msg(err.message||'No se pudo guardar.'));btn.disabled=false;}
  });
}

/* ---------------- Documentos (Reglamento, Privacidad, Uso de imagen, Visoría) ---------------- */
function documentForm(d){
  return `<form class="ct-form" id="documentForm" data-code="${esc(d.code)}">
    <label>Título<input name="title" value="${esc(d.title)}" required></label>
    <label>Contenido<textarea name="body" rows="10" required>${esc(d.body||'')}</textarea></label>
    <div class="ct-form-grid">
      <label class="ct-check"><input type="checkbox" name="required" ${d.required?'checked':''}> Obligatorio para el club</label>
      <label>Fecha de vigencia<input type="date" name="effectiveDate" value="${d.effectiveDate||''}"></label>
    </div>
    <label class="ct-check"><input type="checkbox" name="bumpVersion"> Este cambio requiere que las familias vuelvan a firmar (sube la versión)</label>
    ${msg('')}<div class="ct-row-actions"><button class="ct-btn primary" type="submit">Guardar</button><button class="ct-btn" type="button" id="docCancel">Cancelar</button></div>
  </form>`;
}
function renderDocuments(panel){
  panel.innerHTML=`<div id="docFormWrap"></div>
    ${data.documents.length?data.documents.map(d=>`
      <article class="ct-row">
        <div class="ct-row-head"><div class="ct-row-title">${esc(d.title)}</div><span class="ct-badge" data-status="published">v${esc(d.version)}</span></div>
        <div class="ct-row-meta">${d.required?'Obligatorio':'Opcional'} · vigente desde ${esc(d.effectiveDate||'—')}</div>
        ${canWrite?`<div class="ct-row-actions"><button class="ct-btn" data-edit="${esc(d.code)}" type="button">Editar</button></div>`:''}
      </article>`).join(''):'<div class="ct-empty">Sin documentos.</div>'}`;
  if(!canWrite)return;
  panel.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',()=>{
    const d=data.documents.find(x=>x.code===btn.dataset.edit);
    $('docFormWrap').innerHTML=documentForm(d);
    $('docCancel').addEventListener('click',()=>{$('docFormWrap').innerHTML='';});
    $('documentForm').addEventListener('submit',async e=>{
      e.preventDefault();const f=e.target,b=f.querySelector('button[type="submit"]');b.disabled=true;const fd=new FormData(f);
      try{
        await rpc('v2_centro_tanner_document_upsert',{
          organization_id:orgId, code:f.dataset.code, title:fd.get('title'), body:fd.get('body'),
          required:fd.get('required')==='on', effective_date:fd.get('effectiveDate')||null,
          bump_version:fd.get('bumpVersion')==='on'
        });
        $('docFormWrap').innerHTML='';await loadAll();renderPanel();
      }catch(err){f.insertAdjacentHTML('beforeend',msg(err.message||'No se pudo guardar.'));b.disabled=false;}
    });
  }));
}

/* ---------------- Cambios (changelog) ---------------- */
function changeForm(c){
  return `<form class="ct-form" id="changeForm" data-id="${esc(c?.id||'')}">
    <div class="ct-form-grid">
      <label>Versión (ej. v1.2)<input name="versionLabel" value="${esc(c?.versionLabel||'')}" required></label>
      <label>Fecha de vigencia<input type="date" name="effectiveDate" value="${c?.effectiveDate||''}"></label>
    </div>
    <label>Título<input name="title" value="${esc(c?.title||'')}" required></label>
    <label>Descripción<textarea name="description" required>${esc(c?.description||'')}</textarea></label>
    <div class="ct-form-grid">
      <label>Política relacionada<select name="relatedPolicyId"><option value="">— Ninguna —</option>${data.policies.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('')}</select></label>
      <label>Estado<select name="status"><option value="published" ${(!c||c.status==='published')?'selected':''}>Publicado</option><option value="draft" ${c?.status==='draft'?'selected':''}>Borrador</option></select></label>
    </div>
    ${msg('')}<div class="ct-row-actions"><button class="ct-btn primary" type="submit">Guardar</button><button class="ct-btn" type="button" id="changeCancel">Cancelar</button></div>
  </form>`;
}
function renderChanges(panel){
  panel.innerHTML=`${canWrite?`<button class="ct-btn primary" id="newChange" type="button">+ Nuevo cambio</button>`:''}
    <div id="changeFormWrap"></div>
    ${data.changes.length?data.changes.map(c=>`
      <article class="ct-row">
        <div class="ct-row-head"><div class="ct-row-title">${esc(c.versionLabel)} — ${esc(c.title)}</div><span class="ct-badge" data-status="${esc(c.status)}">${esc(c.status)}</span></div>
        <div class="ct-row-meta">${esc(c.description)}</div>
      </article>`).join(''):'<div class="ct-empty">Sin cambios registrados.</div>'}`;
  if(!canWrite)return;
  $('newChange')?.addEventListener('click',()=>{
    $('changeFormWrap').innerHTML=changeForm(null);
    $('changeCancel').addEventListener('click',()=>{$('changeFormWrap').innerHTML='';});
    $('changeForm').addEventListener('submit',async e=>{
      e.preventDefault();const f=e.target,b=f.querySelector('button[type="submit"]');b.disabled=true;const fd=new FormData(f);
      try{
        await rpc('v2_centro_tanner_change_upsert',{
          organization_id:orgId, id:null, version_label:fd.get('versionLabel'), title:fd.get('title'),
          description:fd.get('description'), effective_date:fd.get('effectiveDate')||null,
          status:fd.get('status'), related_policy_id:fd.get('relatedPolicyId')||null, related_document_code:null
        });
        $('changeFormWrap').innerHTML='';await loadAll();renderPanel();
      }catch(err){f.insertAdjacentHTML('beforeend',msg(err.message||'No se pudo guardar.'));b.disabled=false;}
    });
  });
}

/* ---------------- Aceptaciones ---------------- */
async function renderAcceptance(panel){
  panel.innerHTML='<div class="ct-loading">Calculando…</div>';
  try{
    const stats=await rpc('v2_centro_tanner_acceptance_stats',{organization_id:orgId});
    panel.innerHTML=stats.length?`<table class="ct-table"><thead><tr><th>Documento</th><th>Versión</th><th>Aceptados</th><th>Pendientes</th><th>%</th></tr></thead><tbody>
      ${stats.map(s=>{const pct=s.eligible>0?Math.round((s.accepted/s.eligible)*1000)/10:0;return `<tr><td>${esc(s.title)}</td><td>v${esc(s.version)}</td><td>${esc(s.accepted)}</td><td>${esc(Math.max(0,s.eligible-s.accepted))}</td><td>${esc(pct)}%</td></tr>`;}).join('')}
    </tbody></table>`:'<div class="ct-empty">Sin documentos activos.</div>';
  }catch(e){panel.innerHTML=`<div class="ct-empty">${esc(e.message||'No se pudo calcular.')}</div>`;}
}

/* ---------------- Búsquedas sin resultado ---------------- */
function renderMisses(panel){
  panel.innerHTML=data.searchMisses.length?`<table class="ct-table"><thead><tr><th>Búsqueda</th><th>Veces</th></tr></thead><tbody>
    ${data.searchMisses.map(s=>`<tr><td>${esc(s.query)}</td><td>${esc(s.count)}</td></tr>`).join('')}
  </tbody></table><p class="ct-row-meta" style="margin-top:10px">Últimos 30 días. Buena fuente para nuevas FAQ.</p>`:'<div class="ct-empty">No hay búsquedas sin resultado recientes.</div>';
}

async function boot(){
  const {data:{session}}=await supabase.auth.getSession();if(!session){location.href='/';return;}
  const contexts=await rpc('v2_my_context');
  if(!contexts?.length){$('deniedText').textContent='Tu llave todavía no pertenece a un club.';show('deniedView');return;}
  const ctx=contexts[0];orgId=ctx.organization_id;
  const modules=await rpc('v2_my_modules',{organization_id:orgId});
  const mod=modules.find(m=>m.module_code==='centro_tanner');
  if(!mod?.enabled||!mod?.can_read){$('deniedText').textContent='Tu llave no abre Centro Tanner.';show('deniedView');return;}
  canWrite=!!mod.can_write;
  try{await loadAll();}catch(e){$('deniedText').textContent=e.message||'No se pudo cargar Centro Tanner.';show('deniedView');return;}
  renderPanel();show('view');
}

boot().catch(error=>{$('deniedText').textContent=error.message||'No pudimos abrir Centro Tanner.';show('deniedView');});

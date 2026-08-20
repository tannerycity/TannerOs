const SUPABASE_URL='https://pacnegivzgxpanphrnwp.supabase.co';
export const BRANDING_BUCKET='tanneros-branding';

const defaults={
  brand:'Tannery City',product:'TannerOS',appName:'TannerOS',tagline:'To our city. To our family. To our Tanners.',
  colors:{primary:'#012A3A',secondary:'#087D8E',accent:'#C6AC5C',background:'#F5F3EB'},
  assets:{logo:null,logoDark:null,mark:null,appIcon180:null,appIcon192:null,appIcon512:null,splash:null}
};

export function normalizeBranding(value={}){
  return {...defaults,...value,colors:{...defaults.colors,...(value?.colors||{})},assets:{...defaults.assets,...(value?.assets||{})}};
}

export function brandingAssetUrl(path){
  if(!path)return null;
  const safe=String(path).split('/').map(encodeURIComponent).join('/');
  return `${SUPABASE_URL}/storage/v1/object/public/${BRANDING_BUCKET}/${safe}`;
}

function ensureLink(rel,id){let link=document.getElementById(id);if(!link){link=document.createElement('link');link.id=id;link.rel=rel;document.head.appendChild(link);}return link;}
function ensureMeta(name){let meta=document.querySelector(`meta[name="${name}"]`);if(!meta){meta=document.createElement('meta');meta.name=name;document.head.appendChild(meta);}return meta;}
function colorMix(hex,amount=-18){const n=parseInt(String(hex).slice(1),16);if(Number.isNaN(n))return hex;const clamp=x=>Math.max(0,Math.min(255,x));const r=clamp((n>>16)+amount),g=clamp(((n>>8)&255)+amount),b=clamp((n&255)+amount);return `#${[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase()}`;}
function setImage(el,url,alt){if(!el||!url)return;el.innerHTML='';const img=document.createElement('img');img.src=url;img.alt=alt||'';img.decoding='async';img.style.width='100%';img.style.height='100%';img.style.objectFit='contain';el.appendChild(img);el.classList.add('has-brand-image');}

export function applyBranding(raw,{organizationId}={}){
  const brand=normalizeBranding(raw),root=document.documentElement,c=brand.colors;
  const vars={'--tos-ink':c.primary,'--tos-ink-deep':colorMix(c.primary,-12),'--tos-teal':c.secondary,'--tos-teal-soft':`${c.secondary}18`,'--tos-gold':c.accent,'--tos-bg':c.background,'--ink':c.primary,'--teal':c.secondary,'--gold':c.accent};
  Object.entries(vars).forEach(([k,v])=>root.style.setProperty(k,v));
  document.body?.style.setProperty('--brand-primary',c.primary);
  let runtime=document.getElementById('tosBrandRuntime');if(!runtime){runtime=document.createElement('style');runtime.id='tosBrandRuntime';document.head.appendChild(runtime);}runtime.textContent=`.tos-nav-item.active{background:var(--tos-teal)!important}.tos-welcome,.brand-hero{background:linear-gradient(120deg,var(--tos-ink-deep),var(--tos-teal))!important}.tos-brand-mark{background:var(--tos-gold)!important}.primary{background:var(--tos-ink-deep)}.hero{background:var(--tos-ink-deep)}`;
  ensureMeta('theme-color').content=c.primary;ensureMeta('apple-mobile-web-app-capable').content='yes';ensureMeta('apple-mobile-web-app-status-bar-style').content='black-translucent';ensureMeta('apple-mobile-web-app-title').content=brand.appName;
  const icon180=brandingAssetUrl(brand.assets.appIcon180);
  if(icon180){const apple=ensureLink('apple-touch-icon','tosAppleTouchIcon');apple.href=icon180;apple.sizes='180x180';const fav=ensureLink('icon','tosFavicon');fav.href=icon180;fav.type='image/png';}
  if(organizationId){const manifest=ensureLink('manifest','tosManifest');manifest.href=`/api/manifest?org=${encodeURIComponent(organizationId)}&v=${encodeURIComponent(brand.updatedAt||Date.now())}`;}
  const markUrl=brandingAssetUrl(brand.assets.mark)||icon180;
  document.querySelectorAll('.tos-brand-mark,.brand-mark').forEach(el=>{if(markUrl)setImage(el,markUrl,brand.brand);else if(!el.querySelector('img'))el.textContent=(brand.brand||'T').trim().charAt(0).toUpperCase();});
  const lightLogo=brandingAssetUrl(brand.assets.logo),darkLogo=brandingAssetUrl(brand.assets.logoDark)||lightLogo,logoUrl=darkLogo||lightLogo;
  document.querySelectorAll('.tos-brand').forEach(box=>{let word=box.querySelector('.tos-brand-wordmark');if(darkLogo){if(!word){word=document.createElement('img');word.className='tos-brand-wordmark';word.alt=brand.brand;const copy=box.querySelector(':scope > div:last-child');copy?.prepend(word);}word.src=darkLogo;word.style.display='block';word.style.maxWidth='145px';word.style.maxHeight='30px';word.style.objectFit='contain';word.style.objectPosition='left center';const strong=box.querySelector(':scope > div:last-child > strong');if(strong)strong.style.display='none';}else if(word){word.remove();const strong=box.querySelector(':scope > div:last-child > strong');if(strong)strong.style.display='block';}});
  document.querySelectorAll('[data-brand-logo]').forEach(el=>{if(logoUrl)setImage(el,logoUrl,brand.brand);});
  document.querySelectorAll('.brand-lockup').forEach(lock=>{const mark=lock.querySelector('.brand-mark');if(lightLogo&&lock.closest('.auth-wrap')){let img=lock.querySelector('.tos-login-logo');if(!img){img=document.createElement('img');img.className='tos-login-logo';lock.prepend(img);}img.src=lightLogo;img.alt=brand.brand;img.style.maxWidth='220px';img.style.maxHeight='72px';img.style.objectFit='contain';if(mark)mark.style.display='none';const copy=lock.querySelector(':scope > div:last-child');if(copy)copy.style.display='none';}});
  document.querySelectorAll('[data-brand-name]').forEach(el=>el.textContent=brand.brand);document.querySelectorAll('[data-brand-product]').forEach(el=>el.textContent=brand.product);document.querySelectorAll('[data-brand-tagline]').forEach(el=>el.textContent=brand.tagline||'');document.querySelectorAll('.tos-brand strong').forEach(el=>el.textContent=brand.product);
  document.querySelectorAll('.brand-lockup .eyebrow').forEach(el=>{if(/TANNERY CITY|CLUB|ORGANIZACI/i.test(el.textContent||''))el.textContent=brand.brand.toUpperCase();});
  const titleParts=document.title.split('·').map(x=>x.trim()).filter(Boolean),page=titleParts.length>1?titleParts[0]:'';document.title=page?`${page} · ${brand.appName}`:brand.appName;
  window.__tosBranding=brand;window.dispatchEvent(new CustomEvent('tanneros:branding',{detail:brand}));return brand;
}

export async function loadBranding(supabase,organizationId){const {data,error}=await supabase.rpc('v2_branding',{organization_id:organizationId});if(error)throw error;return normalizeBranding(data||{});}
export async function loadAndApplyBranding(supabase,organizationId){const branding=await loadBranding(supabase,organizationId);return applyBranding(branding,{organizationId});}

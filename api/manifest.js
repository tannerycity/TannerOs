const SUPABASE_URL='https://pacnegivzgxpanphrnwp.supabase.co';
const KEY='sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG';
const BUCKET='tanneros-branding';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function asset(path){return path?`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${String(path).split('/').map(encodeURIComponent).join('/')}`:null;}
module.exports=async function handler(req,res){
  const org=String(req.query?.org||'');if(!uuid.test(org)){res.status(400).json({error:'invalid organization'});return;}
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/v2_public_branding_by_org`,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({organization_id:org})});
    if(!r.ok)throw new Error(`branding ${r.status}`);const b=await r.json();const name=b?.appName||b?.product||b?.brand||'TannerOS';const icons=[];
    if(b?.assets?.appIcon192)icons.push({src:asset(b.assets.appIcon192),sizes:'192x192',type:'image/png',purpose:'any maskable'});
    if(b?.assets?.appIcon512)icons.push({src:asset(b.assets.appIcon512),sizes:'512x512',type:'image/png',purpose:'any maskable'});
    res.setHeader('Content-Type','application/manifest+json; charset=utf-8');res.setHeader('Cache-Control','public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
    res.status(200).send(JSON.stringify({id:`/v2/?org=${org}`,name,short_name:name.slice(0,18),description:b?.tagline||`${b?.brand||'Club'} · ${name}`,start_url:'/v2/',scope:'/v2/',display:'standalone',orientation:'any',background_color:b?.colors?.background||'#F5F3EB',theme_color:b?.colors?.primary||'#012A3A',icons}));
  }catch(e){res.status(502).json({error:'branding unavailable'});}
};

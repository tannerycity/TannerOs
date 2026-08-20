import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {applyBranding,loadAndApplyBranding} from '/v2/branding.js';
import {initUniversalExperience} from '/v2/experience.js';
import {initFocusFallback} from '/v2/focus-fallback.js?v=20260819a';
import {installProductExtensions} from '/v2/product-extensions.js?v=20260819a';
import {installModuleContext} from '/v2/module-context.js?v=20260819a';
const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let lastOrg=null,busy=false;
function installUiSystem(){document.body?.classList.add('tos-ui-v3');if(document.getElementById('tosUiSystemCss'))return;const link=document.createElement('link');link.id='tosUiSystemCss';link.rel='stylesheet';link.href='/v2/ui-system.css?v=20260819a';document.head.appendChild(link);}
async function applyForSession(){
  if(busy)return;busy=true;
  try{
    const {data:{session}}=await supabase.auth.getSession();if(!session)return;
    const {data,error}=await supabase.rpc('v2_my_context');if(error||!data?.length)return;
    const ctx=data[0],org=ctx.organization_id;if(!org)return;
    installUiSystem();
    let branding=window.__tosBranding;
    if(lastOrg!==org||!branding)branding=await loadAndApplyBranding(supabase,org);
    const experience=await initUniversalExperience({supabase,ctx});
    const navigation=experience?.navigation||window.__tosExperienceNavigation||[];
    installProductExtensions({navigation});
    installModuleContext({navigation});
    await initFocusFallback({supabase,ctx});
    if(branding)applyBranding(branding,{organizationId:org});
    lastOrg=org;
  }catch(e){console.warn('branding/experience auto',e);}finally{busy=false;}
}
applyForSession();
supabase.auth.onAuthStateChange(event=>{if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED')setTimeout(applyForSession,0);if(event==='SIGNED_OUT'){lastOrg=null;window.__tosExperienceNavigation=null;}});

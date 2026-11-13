import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// Cambiar el @usuario de una llave del staff (13/11/2026).
//
// Presidencia: "intenté cambiarle el @ a Luis Felipe y ya no me dejó". No
// existía: la pantalla sólo daba nueva contraseña o pausaba la llave.
//
// Vive aparte de staff-access a propósito: esa función entrega todas las llaves
// del club y no se toca para algo que cabe aquí.
//
// Qué cambia: sólo con qué nombre entra la persona. Su contraseña, su rol, sus
// permisos y su ficha se quedan igual.
//
// Quién puede: quien tiene el módulo Usuarios con escritura en ese club (lo
// mismo que staff-access). Nunca la cuenta del dueño, nunca una llave de otro
// club, nunca una llave que entra con correo.
const corsHeaders={
  "Access-Control-Allow-Origin":"https://app.tannerycity.com",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json"
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:corsHeaders});
function usernameOf(value:unknown){
  return String(value??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/^@/,"").replace(/\s+/g,"_");
}
function reason(error:unknown,fallback="Unexpected error"){
  if(error instanceof Error)return error.message;
  if(error&&typeof error==="object"&&"message" in error)return String((error as {message:unknown}).message);
  return fallback;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const url=Deno.env.get("SUPABASE_URL");
    const anon=Deno.env.get("SUPABASE_ANON_KEY");
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization=req.headers.get("Authorization")||"";
    if(!url||!anon||!service)return json({error:"Server configuration unavailable"},500);
    if(!authorization.startsWith("Bearer "))return json({error:"Unauthorized"},401);
    const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:userError}=await userClient.auth.getUser();
    if(userError||!user)return json({error:"Unauthorized"},401);
    const body=await req.json().catch(()=>({}));
    if(String(body.action||"")!=="rename_username")return json({error:"Invalid action"},400);

    // Mismo permiso que staff-access: ser de ese club y poder escribir en Usuarios.
    const organizationId=String(body.organization_id||"");
    const {data:contexts,error:contextError}=await userClient.rpc("v2_my_context");
    if(contextError)throw new Error(reason(contextError));
    const context=(contexts||[]).find((row:Record<string,unknown>)=>String(row.organization_id)===organizationId);
    if(!context)return json({error:"Not authorized"},403);
    const {data:modules,error:modulesError}=await userClient.rpc("v2_my_modules",{organization_id:organizationId});
    if(modulesError)throw new Error(reason(modulesError));
    const usersAccess=(modules||[]).find((row:Record<string,unknown>)=>row.module_code==="users");
    if(!usersAccess?.enabled||!usersAccess?.can_write)return json({error:"Not authorized"},403);

    const targetUserId=String(body.user_id||""),username=usernameOf(body.username);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId))return json({error:"Membership not found"},404);
    if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username))return json({error:"Username must use 3-32 letters, numbers, dots, dashes or underscores"},400);

    // La llave tiene que ser de ESTE club, y no la del dueño.
    const {data:membership,error:membershipError}=await admin.from("organization_memberships").select("user_id,is_owner").eq("organization_id",organizationId).eq("user_id",targetUserId).maybeSingle();
    if(membershipError)throw new Error(reason(membershipError));
    if(!membership)return json({error:"Membership not found"},404);
    if(membership.is_owner)return json({error:"Owner account is protected"},403);

    const {data:target,error:targetError}=await admin.auth.admin.getUserById(targetUserId);
    if(targetError||!target.user)throw new Error(reason(targetError,"User not found"));
    if(target.user.app_metadata?.login_type!=="username")return json({error:"Only username accounts can be renamed"},400);
    // Sólo llaves del staff: una del portal de familias no se renombra aquí.
    if(!String(target.user.email||"").toLowerCase().endsWith("@staff.tanneros.invalid"))return json({error:"Only username accounts can be renamed"},400);

    const previous=String(target.user.app_metadata?.login_username||"");
    if(previous===username)return json({ok:true,username,previous,changed:false});
    const appMetadata={...(target.user.app_metadata||{}),login_username:username,username_changed_at:new Date().toISOString(),username_changed_by:user.id};
    const {error:updateError}=await admin.auth.admin.updateUserById(targetUserId,{email:`${username}@staff.tanneros.invalid`,email_confirm:true,app_metadata:appMetadata});
    if(updateError){
      if(/already|registered|exists|duplicate/i.test(updateError.message))return json({error:"Username already exists"},409);
      throw new Error(reason(updateError));
    }
    return json({ok:true,username,previous,changed:true});
  }catch(error){console.error("staff-usuario",error);return json({error:reason(error)},500);}
});

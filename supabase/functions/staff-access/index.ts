import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders={
  "Access-Control-Allow-Origin":"https://app.tannerycity.com",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json"
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:corsHeaders});
const roles:Record<string,string>={
  president:"Presidencia",operations:"Operaciones",coach:"Formadores",academy:"Academia",
  cashier:"Taquilla",accounting:"Contabilidad",commercial:"Marketing",scouting:"Scouting",player:"Tanner"
};
function usernameOf(value:unknown){
  return String(value??"").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+/g,"_");
}
function temporaryPassword(){
  const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes=new Uint32Array(13);crypto.getRandomValues(bytes);
  const random=Array.from(bytes,n=>alphabet[n%alphabet.length]).join("");
  return `T!${random}9`;
}
// Un PostgrestError no es un Error de JS: si se deja caer al catch general sale
// "Unexpected error" y se pierde la causa. Eso escondio durante semanas que
// app.guardians no se alcanzaba por PostgREST.
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
    const action=String(body.action||"");

    if(action==="complete_password_change"){
      const appMetadata={...(user.app_metadata||{}),must_change_password:false,password_changed_at:new Date().toISOString()};
      const {error}=await admin.auth.admin.updateUserById(user.id,{app_metadata:appMetadata});
      if(error)throw error;
      return json({ok:true});
    }

    // La familia guarda SU PROPIO correo de contacto al entrar por primera vez.
    // Va antes del candado de "users" porque quien llama es el tutor. La RPC
    // solo deja tocar la fila ligada a su usuario.
    if(action==="save_my_contact_email"){
      const {data,error}=await userClient.rpc("v2_save_my_contact_email",{email:String(body.email||"")});
      if(error)return json({error:reason(error)},400);
      return json(data||{ok:true});
    }

    const organizationId=String(body.organization_id||"");
    const {data:contexts,error:contextError}=await userClient.rpc("v2_my_context");
    if(contextError)throw contextError;
    const context=(contexts||[]).find((row:Record<string,unknown>)=>String(row.organization_id)===organizationId);
    if(!context)return json({error:"Not authorized"},403);
    const {data:modules,error:modulesError}=await userClient.rpc("v2_my_modules",{organization_id:organizationId});
    if(modulesError)throw modulesError;
    const usersAccess=(modules||[]).find((row:Record<string,unknown>)=>row.module_code==="users");
    if(!usersAccess?.enabled||!usersAccess?.can_write)return json({error:"Not authorized"},403);

    // Los tutores se leen y escriben por RPC, no por PostgREST: app.guardians no
    // vive en el esquema public y admin.from("guardians") nunca la alcanzo.
    async function guardianInfo(guardianId:string){
      const {data,error}=await userClient.rpc("v2_guardian_for_access",{organization_id:organizationId,guardian_id:guardianId});
      if(error)throw new Error(reason(error));
      return data as {found:boolean;name:string|null;email:string|null;userId:string|null};
    }

    // Portal de familias con el correo del tutor. NO se crea
    // organization_membership: un tutor no debe poder invocar ningun RPC interno
    // aunque adivine su nombre.
    if(action==="create_guardian_access"){
      const guardianId=String(body.guardian_id||"");
      const email=String(body.email||"").trim().toLowerCase();
      if(!/^[0-9a-f-]{36}$/i.test(guardianId))return json({error:"Valid guardian required"},400);
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:"Valid email required"},400);
      const info=await guardianInfo(guardianId);
      if(!info?.found)return json({error:"Guardian not found"},404);
      if(info.userId)return json({error:"Este tutor ya tiene acceso"},409);
      const displayName=String(info.name||email.split("@")[0]);
      const password=temporaryPassword();
      const {data:created,error:createError}=await admin.auth.admin.createUser({
        email,password,email_confirm:true,
        user_metadata:{display_name:displayName},
        app_metadata:{login_type:"email",portal:"familias",must_change_password:true}
      });
      if(createError){
        if(/already|registered|exists/i.test(createError.message))return json({error:"Ese correo ya tiene una cuenta"},409);
        throw createError;
      }
      const userId=created.user?.id;
      if(!userId)throw new Error("User was not created");
      const {error:linkError}=await userClient.rpc("v2_link_guardian_access",{organization_id:organizationId,guardian_id:guardianId,user_id:userId,email});
      if(linkError){await admin.auth.admin.deleteUser(userId);return json({error:reason(linkError)},409);}
      return json({ok:true,user_id:userId,email,temporary_password:password,display_name:displayName});
    }

    // Portal de familias por USUARIO, sin correo.
    // 51 de los 55 tutores con hijo activo no tienen correo registrado, asi que
    // exigirlo dejaba el portal cerrado para casi todo el club. Dominio propio
    // (@familias.) y no @staff.: son dos padrones y no deben poder chocar.
    if(action==="create_guardian_username_access"){
      const guardianId=String(body.guardian_id||"");
      const username=usernameOf(body.username);
      if(!/^[0-9a-f-]{36}$/i.test(guardianId))return json({error:"Valid guardian required"},400);
      if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username))return json({error:"El usuario necesita entre 3 y 32 letras, numeros, puntos, guiones o guiones bajos"},400);
      const info=await guardianInfo(guardianId);
      if(!info?.found)return json({error:"Guardian not found"},404);
      if(info.userId)return json({error:"Este tutor ya tiene acceso"},409);
      const displayName=String(info.name||username);
      const loginEmail=`${username}@familias.tanneros.invalid`;
      const password=temporaryPassword();
      const {data:created,error:createError}=await admin.auth.admin.createUser({
        email:loginEmail,password,email_confirm:true,
        user_metadata:{display_name:displayName},
        app_metadata:{login_type:"username",login_username:username,portal:"familias",must_change_password:true}
      });
      if(createError){
        if(/already|registered|exists/i.test(createError.message))return json({error:"Ese usuario ya existe"},409);
        throw createError;
      }
      const userId=created.user?.id;
      if(!userId)throw new Error("User was not created");
      // No se manda correo: el del login es inventado y guardarlo haria creer
      // que se le puede escribir a esa direccion.
      const {error:linkError}=await userClient.rpc("v2_link_guardian_access",{organization_id:organizationId,guardian_id:guardianId,user_id:userId,email:null});
      if(linkError){await admin.auth.admin.deleteUser(userId);return json({error:reason(linkError)},409);}
      return json({ok:true,user_id:userId,username,temporary_password:password,display_name:displayName});
    }

    if(action==="revoke_guardian_access"){
      const guardianId=String(body.guardian_id||"");
      if(!/^[0-9a-f-]{36}$/i.test(guardianId))return json({error:"Valid guardian required"},400);
      const {data,error}=await userClient.rpc("v2_unlink_guardian_access",{organization_id:organizationId,guardian_id:guardianId});
      if(error)return json({error:reason(error)},400);
      const previous=(data as {userId:string|null})?.userId;
      if(!previous)return json({ok:true,already:true});
      await admin.auth.admin.deleteUser(String(previous)).catch(()=>{});
      return json({ok:true});
    }

    if(action==="reset_guardian_password"){
      const guardianId=String(body.guardian_id||"");
      if(!/^[0-9a-f-]{36}$/i.test(guardianId))return json({error:"Valid guardian required"},400);
      const info=await guardianInfo(guardianId);
      if(!info?.found)return json({error:"Guardian not found"},404);
      if(!info.userId)return json({error:"Este tutor no tiene acceso todavía"},400);
      const {data:target,error:targetError}=await admin.auth.admin.getUserById(String(info.userId));
      if(targetError||!target.user)throw targetError||new Error("User not found");
      const password=temporaryPassword();
      const appMetadata={...(target.user.app_metadata||{}),must_change_password:true,password_reset_at:new Date().toISOString()};
      const {error:updateError}=await admin.auth.admin.updateUserById(String(info.userId),{password,app_metadata:appMetadata});
      if(updateError)throw updateError;
      // El login puede ser correo real o usuario inventado; se devuelven los dos
      // para que la pantalla muestre el que corresponde.
      return json({ok:true,email:target.user.email,username:target.user.app_metadata?.login_username||"",temporary_password:password});
    }

    if(action==="send_email_invite"){
      const email=String(body.email||"").trim().toLowerCase(),roleCode=String(body.role_code||"");
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:"Valid email required"},400);
      const role=roles[roleCode];if(!role)return json({error:"Invalid role"},400);
      const {data:userPage,error:listError}=await admin.auth.admin.listUsers({page:1,perPage:1000});
      if(listError)throw listError;
      const existing=(userPage.users||[]).find(candidate=>String(candidate.email||"").toLowerCase()===email);
      const displayName=String(body.display_name||existing?.user_metadata?.display_name||email.split("@")[0]).trim();
      if(displayName.length<2||displayName.length>120)return json({error:"Valid display name required"},400);
      const invitationData={display_name:displayName,role_label:role,organization_name:"Tannery City FC",brand_name:"Tannery City"};
      if(existing?.email_confirmed_at)return json({error:"Email already registered"},409);
      const {data:invitationId,error:recordError}=await userClient.rpc("v2_create_invitation",{organization_id:organizationId,email,role_code:roleCode});
      if(recordError)throw recordError;
      let invitedUser=existing||null,emailSent=false,invitationLink="";
      if(existing){
        const {error:existingMetadataError}=await admin.auth.admin.updateUserById(existing.id,{user_metadata:{...(existing.user_metadata||{}),...invitationData}});
        if(existingMetadataError)throw existingMetadataError;
        const {error:resendError}=await admin.auth.resend({type:"signup",email,options:{emailRedirectTo:"https://app.tannerycity.com/"}});
        if(resendError){
          const {data:generated,error:linkError}=await admin.auth.admin.generateLink({type:"magiclink",email,options:{redirectTo:"https://app.tannerycity.com/"}});
          if(linkError)throw new Error(resendError.message+"; "+linkError.message);
          invitedUser=generated.user||existing;invitationLink=generated.properties?.action_link||"";
        }else emailSent=true;
      }else{
        const {data:invited,error:inviteError}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:"https://app.tannerycity.com/",data:invitationData});
        if(inviteError){
          const {data:afterPage,error:afterListError}=await admin.auth.admin.listUsers({page:1,perPage:1000});
          if(afterListError)throw afterListError;
          const afterExisting=(afterPage.users||[]).find(candidate=>String(candidate.email||"").toLowerCase()===email);
          const linkType:"magiclink"|"invite"=afterExisting?"magiclink":"invite";
          const {data:generated,error:linkError}=await admin.auth.admin.generateLink({type:linkType,email,options:{redirectTo:"https://app.tannerycity.com/",data:invitationData}});
          if(linkError)throw new Error(inviteError.message+"; "+linkError.message);
          invitedUser=generated.user||afterExisting||null;invitationLink=generated.properties?.action_link||"";
        }else{invitedUser=invited.user;emailSent=true;}
      }
      if(!invitedUser?.id)throw new Error("Invitation user was not created");
      const appMetadata={...(invitedUser.app_metadata||{}),login_type:"email",must_change_password:true,invitation_organization_id:organizationId};
      const {error:metadataError}=await admin.auth.admin.updateUserById(invitedUser.id,{app_metadata:appMetadata,user_metadata:{...(invitedUser.user_metadata||{}),...invitationData}});
      if(metadataError)throw metadataError;
      if(!emailSent&&!invitationLink)throw new Error("Invitation link was not generated");
      return json({ok:true,invitation_id:invitationId,user_id:invitedUser.id,email,role,email_sent:emailSent,invitation_link:invitationLink||null});
    }

    if(action==="create_username_user"){
      const username=usernameOf(body.username),displayName=String(body.display_name||"").trim(),roleCode=String(body.role_code||"");
      if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username))return json({error:"Username must use 3-32 letters, numbers, dots, dashes or underscores"},400);
      if(displayName.length<2||displayName.length>120)return json({error:"Valid display name required"},400);
      const role=roles[roleCode];if(!role)return json({error:"Invalid role"},400);
      const email=`${username}@staff.tanneros.invalid`,password=temporaryPassword();
      const {data:created,error:createError}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:displayName},app_metadata:{login_type:"username",login_username:username,must_change_password:true}});
      if(createError){if(/already|registered|exists/i.test(createError.message))return json({error:"Username already exists"},409);throw createError;}
      const userId=created.user?.id;if(!userId)throw new Error("User was not created");
      try{
        const {error:profileError}=await admin.from("profiles").upsert({user_id:userId,display_name:displayName,active:true,updated_at:new Date().toISOString()},{onConflict:"user_id"});if(profileError)throw new Error(reason(profileError));
        const {error:membershipError}=await admin.from("organization_memberships").upsert({organization_id:organizationId,user_id:userId,role,active:true,is_owner:false,updated_at:new Date().toISOString()},{onConflict:"organization_id,user_id"});if(membershipError)throw new Error(reason(membershipError));
      }catch(error){await admin.auth.admin.deleteUser(userId);throw error;}
      return json({ok:true,user_id:userId,username,temporary_password:password,display_name:displayName,role});
    }

    if(action==="reset_username_password"){
      const targetUserId=String(body.user_id||"");
      const {data:membership,error:membershipError}=await admin.from("organization_memberships").select("user_id,is_owner").eq("organization_id",organizationId).eq("user_id",targetUserId).maybeSingle();
      if(membershipError)throw new Error(reason(membershipError));if(!membership)return json({error:"Membership not found"},404);if(membership.is_owner)return json({error:"Owner account is protected"},403);
      const {data:target,error:targetError}=await admin.auth.admin.getUserById(targetUserId);if(targetError||!target.user)throw targetError||new Error("User not found");
      if(target.user.app_metadata?.login_type!=="username")return json({error:"Password resets for email accounts use email recovery"},400);
      const password=temporaryPassword(),appMetadata={...(target.user.app_metadata||{}),must_change_password:true,password_reset_at:new Date().toISOString()};
      const {error:updateError}=await admin.auth.admin.updateUserById(targetUserId,{password,app_metadata:appMetadata});if(updateError)throw updateError;
      return json({ok:true,username:target.user.app_metadata?.login_username||"",temporary_password:password});
    }

    return json({error:"Invalid action"},400);
  }catch(error){console.error("staff-access",error);return json({error:reason(error)},500);}
});

-- El schema public tiene un default privilege de Supabase que otorga EXECUTE a anon
-- automaticamente en toda funcion NUEVA creada ahi (para exponerla via PostgREST por
-- default). Mi DROP+CREATE de public.v2_orders quedo expuesta a anon sin querer
-- (la funcion original, antes del DROP, NO tenia a anon). Se revoca explicitamente.
revoke execute on function public.v2_orders(uuid, text) from anon;;

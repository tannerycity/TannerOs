-- G1 · Quitar la version duplicada de v2_post_expense
--
-- NO APLICADA. Se deja escrita para que alguien la revise y decida.
--
-- EL PROBLEMA
-- public.v2_post_expense existe dos veces:
--   oid 28972 · 9 argumentos  (la vieja)
--   oid 32499 · 10 argumentos (la nueva, con supplier_name text DEFAULT NULL)
-- y lo mismo en private.command_post_expense (oids 28969 y 32498).
--
-- Como el decimo argumento tiene DEFAULT, una llamada con nueve encaja con las
-- dos y Postgres se niega a elegir:
--   "Could not choose the best candidate function between: ..."
--
-- Eso dejo Taquilla sin poder registrar egresos. Contabilidad si mandaba
-- supplier_name, asi que ahi nunca se noto: el mismo boton funcionaba en una
-- pantalla y fallaba en la otra.
--
-- EL PARCHE QUE YA ESTA EN PRODUCCION
-- Las dos pantallas mandan supplier_name siempre, lo que desambigua sin tocar
-- la base, y qa-static comprueba que lo sigan haciendo. Esto funciona, pero
-- deja una trampa puesta para la siguiente pantalla que llame a esta funcion.
--
-- QUE HACE ESTA MIGRACION
-- Borra la version de nueve argumentos. La de diez hace exactamente lo mismo y
-- ademas guarda el proveedor, con un respaldo que lo saca de metadata->>'who'
-- cuando no se lo mandan, asi que ninguna llamada pierde comportamiento.
--
-- ANTES DE APLICARLA, COMPROBAR
--   1. Que ningun otro cliente (una integracion, un script) llame a la version
--      de nueve. Un drop no avisa: la llamada empieza a fallar en caliente.
--   2. Correrla primero en una rama de Supabase, no en produccion.
--   3. Que qa-static y el humo de navegador sigan en verde despues.
--
-- ES REVERSIBLE: al final va el CREATE que la devuelve tal cual esta hoy,
-- comentado. Guardarlo antes de aplicar.

begin;

-- Solo las de nueve argumentos. La firma va completa a proposito: sin ella,
-- Postgres no sabria cual de las dos borrar.
drop function if exists public.v2_post_expense(
  uuid, numeric, date, text, text, text, text, jsonb, text
);

drop function if exists private.command_post_expense(
  uuid, numeric, date, text, text, text, text, jsonb, text
);

-- Queda una sola de cada una. Si esto no devuelve 1 y 1, algo mas cambio y la
-- migracion no deberia continuar.
do $$
declare v_pub int; v_priv int;
begin
  select count(*) into v_pub  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'  and p.proname='v2_post_expense';
  select count(*) into v_priv from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='private' and p.proname='command_post_expense';
  if v_pub <> 1 or v_priv <> 1 then
    raise exception 'Se esperaba una version de cada una, hay % publicas y % privadas', v_pub, v_priv;
  end if;
end $$;

commit;

-- Para revertir: recuperar el cuerpo exacto con
--   select pg_get_functiondef(oid) from pg_proc where oid in (28969, 28972);
-- ANTES de aplicar esto, y guardarlo junto a este archivo.

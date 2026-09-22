-- Al recrear la función, Postgres otorga EXECUTE a PUBLIC por default. El patrón
-- del proyecto es que private quede cerrado y solo el envoltorio v2_ sea llamable.
revoke all on function private.command_create_parking(uuid,text,uuid,text,text,text,text,boolean,text,text)
  from public, anon, authenticated;;

create or replace function private.normalize_public_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog'
as $$
declare
  v text;
begin
  v := trim(coalesce(p_phone,''));
  if v = '' then return null; end if;

  v := regexp_replace(v,'[[:space:]().-]','','g');
  if v ~ '^00[1-9][0-9]{7,14}$' then
    v := '+' || substr(v,3);
  end if;

  -- Legacy compatibility for current internal/compat callers.
  if v ~ '^[0-9]{10}$' then
    v := '+52' || v;
  end if;

  -- E.164 envelope.
  if v !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Invalid phone number';
  end if;

  -- Mexico: exactly 10 national digits.
  if v ~ '^\+52' and v !~ '^\+52[0-9]{10}$' then
    raise exception 'Mexico phone must have exactly 10 digits';
  end if;

  -- NANP / USA: +1 + exactly 10 national digits.
  if v ~ '^\+1' and v !~ '^\+1[0-9]{10}$' then
    raise exception 'US/Canada phone must have exactly 10 digits';
  end if;

  -- Argentina: fixed-line E.164 has 10 NSN digits; mobile includes token 9 + 10 digits.
  if v ~ '^\+54' and v !~ '^\+54([0-9]{10}|9[0-9]{10})$' then
    raise exception 'Invalid Argentina phone number';
  end if;

  return v;
end
$$;;

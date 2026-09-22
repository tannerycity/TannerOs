create or replace function private.query_business_rules(p_organization_id uuid)
returns table(rule_key text,domain text,title text,description text,source text,precedence smallint,enforcement text,status text,test_status text,source_ref text,metadata jsonb)
language plpgsql stable security definer
set search_path='pg_catalog','app','private'
as $$
begin
  if not private.has_any_module_access(p_organization_id,array['qa','admin'],false) then raise exception 'Not authorized'; end if;
  return query select b.rule_key,b.domain,b.title,b.description,b.source,b.precedence,b.enforcement,b.status,b.test_status,b.source_ref,b.metadata from app.business_rule_catalog b order by b.domain,b.rule_key;
end $$;;

alter table app.players add column if not exists archived_at timestamptz;

update app.players vp
set status = case
      when p.deleted then 'inactive'
      when p.status='Activo' then 'active'
      when p.status='Baja' then 'withdrawn'
      else 'inactive'
    end,
    archived_at = case when p.deleted then coalesce(p.updated_at,p.legacy_updated_at,now()) else null end,
    updated_at = now()
from public.players p
where vp.legacy_id=p.id;

update app.billing_profiles bp
set status = case when vp.status='active' then 'active' else 'closed' end,
    needs_review = (vp.status='active' and coalesce(p.monthly_fee,0)=0 and coalesce(p.scholarship,false)=false),
    review_reason = case when vp.status='active' and coalesce(p.monthly_fee,0)=0 and coalesce(p.scholarship,false)=false then 'Jugador activo sin cuota ni beca definida en v1' else null end,
    updated_at = now()
from app.players vp
join public.players p on p.id=vp.legacy_id
where bp.player_id=vp.id;;

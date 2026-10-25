# Carga incremental del 25/10/2026 (aprobada por Presidencia): lee
# TC_TCP_Activos_Digitales_para_TannerOS_2027.xlsx y genera el SQL idempotente
# que se corrió en tres bloques (activos, cuentas+métricas, compromisos). Los
# IDs del Excel quedan en external_ref; los de TannerOS no se tocan.
import sys, openpyxl, json
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
ORG = "'3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8'::uuid"
q = lambda v: 'null' if v is None or str(v).strip()=='' else "'" + str(v).strip().replace("'", "''") + "'"
num = lambda v: 'null' if v is None or str(v).strip()=='' else str(v)
ent = lambda e: {'Tannery City FC':'TC','Tannery City Park':'TCP'}.get(str(e).strip(),'AMBOS')
rows = lambda name: [r for r in wb[name].iter_rows(min_row=2, values_only=True) if r and r[0]]
out = ["do $carga$", "declare v_id uuid; v_ag uuid; v_n int;", "begin"]
CAT = {'Contenido':'content','Video':'content','Evento':'content'}
REACT = {'TC-WEB-LOGO':'TC-DIG-005','TC-WA-COMM':'TC-DIG-007'}
for a in rows('ACTIVOS DIGITALES'):
    aid, entidad, fam, activo, canal, unidad, desc, disp, val, notas = a
    cat = CAT.get(fam, 'digital'); av = 'partial' if val in ('CONDICIONADO','PROPUESTO') else 'available'
    nota = f"{disp}. {notas}"
    cols = f"entity={q(ent(entidad))}, channel={q(canal)}, unit={q(unidad)}, family={q(fam)}, validation={q(val)}, external_ref={q(aid)}, internal_notes={q(nota)}, price_status='por_cotizar'"
    if aid in REACT:
        out.append(f"  update app.sponsor_assets set archived_at=null, name={q(activo)}, category='{cat}', description={q(desc)}, availability='{av}', price=null, {cols}, updated_at=now() where organization_id={ORG} and legacy_id={q(REACT[aid])} and external_ref is null;")
    else:
        out.append(f"  insert into app.sponsor_assets(organization_id,name,category,price,description,availability,metadata,entity,channel,unit,family,validation,external_ref,internal_notes,price_status) select {ORG},{q(activo)},'{cat}',null,{q(desc)},'{av}','{{\"fuente\":\"TC_TCP_Activos_Digitales_2027.xlsx\"}}'::jsonb,{q(ent(entidad))},{q(canal)},{q(unidad)},{q(fam)},{q(val)},{q(aid)},{q(nota)},'por_cotizar' where not exists(select 1 from app.sponsor_assets x where x.organization_id={ORG} and x.external_ref={q(aid)});")
# Paquetes (precio en propuesta: nunca se publica hasta aprobarlo)
for p in rows('TARIFAS INTERNAS'):
    pid, oferta, canal, unidad, precio, estatus, obs = p
    if pid not in ('PREC-005','PREC-006','PREC-007'): continue
    out.append(f"  insert into app.sponsor_assets(organization_id,name,category,price,description,availability,metadata,entity,channel,unit,family,validation,external_ref,internal_notes,price_status) select {ORG},{q(oferta.replace('Integración digital paquete ','Paquete '))},'other',{num(precio)},{q('Paquete físico + digital por mes.')},'available','{{\"fuente\":\"TC_TCP_Activos_Digitales_2027.xlsx\"}}'::jsonb,'AMBOS',{q(canal)},{q(unidad)},'Paquete','PROPUESTO',{q(pid)},{q(obs)},'propuesta' where not exists(select 1 from app.sponsor_assets x where x.organization_id={ORG} and x.external_ref={q(pid)});")
# Frentes de Españita: activos físicos de TCP que viven aquí (Presidencia, 25/10/2026)
for n in range(1,9):
    ref = f"TCP-ESP-F{n:02d}"
    out.append(f"  insert into app.sponsor_assets(organization_id,name,category,price,description,availability,metadata,entity,channel,unit,family,validation,external_ref,internal_notes,price_status) select {ORG},'Frente Españita {n}','park',null,'Espacio publicitario físico sobre el Corredor Españita.','available','{{\"fuente\":\"TC_TCP_Activos_Digitales_2027.xlsx\"}}'::jsonb,'TCP','Presencial','espacio','Espacio físico','PENDIENTE','{ref}','No reservado. Aforo vial aún no medido; precio por definir.','por_cotizar' where not exists(select 1 from app.sponsor_assets x where x.organization_id={ORG} and x.external_ref='{ref}');")
# Cuentas
for c in rows('CANALES Y CUENTAS'):
    acc, entidad, plat, tipo, url, base, pend = c
    out.append(f"  insert into app.social_accounts(organization_id,entity,platform,account_type,url,baseline_note,pending_note,external_ref) select {ORG},{q(ent(entidad))},{q(plat)},{q(tipo)},null,{q(base)},{q(((('Referencia: '+url+'. ') if url and 'Sin URL' not in url and 'No insertar' not in url else '')+(pend or '')))},{q(acc)} where not exists(select 1 from app.social_accounts x where x.organization_id={ORG} and x.external_ref={q(acc)});")
# Métricas: fotos, nunca sumas
for m in rows('METRICAS SNAPSHOT'):
    mid, entidad, canal, met, val, unidad, ventana, ini, fin, fuente, valid, obs = m
    fi = q(str(ini)[:10]) if ini else 'null'; ff = q(str(fin)[:10])
    out.append(f"  insert into app.social_metrics(organization_id,entity,channel,metric_key,value,unit,window_label,period_start,period_end,source,validation,notes,external_ref) select {ORG},{q(ent(entidad))},{q(canal)},{q(met)},{num(val)},{q(unidad)},{q(ventana)},{fi}::date,{ff}::date,{q(fuente)},{q(valid)},{q(obs)},{q(mid)} where not exists(select 1 from app.social_metrics x where x.organization_id={ORG} and x.external_ref={q(mid)});")
# Compromisos: ligar a lo capturado (cruce aprobado por Presidencia) y crear lo que falta
LIGA = [ # obl, acuerdo, descripción actual, asset, frecuencia, auditoria, entregado, nueva descripción
 ('OBL-001','cda5d70e-b858-4445-9101-a16b5cb9648d','Activo digital','TCP-SOC-RESHARE','mensual',None,None,None),
 ('OBL-002','cda5d70e-b858-4445-9101-a16b5cb9648d','Activacion de marca en la Gran Final','TCP-EVENT-REC','por gran final',None,None,None),
 ('OBL-003','cda5d70e-b858-4445-9101-a16b5cb9648d','Compartir sus anuncios en redes y grupos de WhatsApp','TCP-WA-COMM','según acuerdo',None,None,None),
 ('OBL-004','cda5d70e-b858-4445-9101-a16b5cb9648d','Menciones en el microfono de las finales y eventos','TCP-LIV-MENTION','en finales','por_auditar',None,None),
 ('OBL-005','192df5b1-8abe-4197-8d29-756e092867a2','Contenido del club','TC-IG-REEL','por convenio',None,None,None),
 ('OBL-006','192df5b1-8abe-4197-8d29-756e092867a2','Publicaciones en redes','TC-IG-PUB','anual',None,None,None),
 ('OBL-007','192df5b1-8abe-4197-8d29-756e092867a2','evento de 4 horas','TCP-EVENT-REC','por convenio',None,None,None),
 ('OBL-008','192df5b1-8abe-4197-8d29-756e092867a2','Presentacion como proveedor oficial Textil de TC','TC-SOC-MENTION','por convenio','por_auditar',None,None),
 ('OBL-011','c0ccbb69-d2b8-4f87-9781-49697bb6bbd5','Reels promociónales','TCP-IG-REEL','por convenio',None,None,None),
 ('OBL-012','c0ccbb69-d2b8-4f87-9781-49697bb6bbd5','Creación y optimización de redes: Facebook, Instagram, Tiktok','TC-FB-PUB','servicio puntual',None,None,None),
 ('OBL-013','c0ccbb69-d2b8-4f87-9781-49697bb6bbd5','Mosaico de 9 publicaciones para presentar la marca','TC-IG-PUB','servicio puntual',None,None,None),
 ('OBL-014','c0ccbb69-d2b8-4f87-9781-49697bb6bbd5','Descuento de paquete publicitario de $20,000 a $8,000','TCP-IG-REEL','venta por separado','venta_aparte',None,None),
 ('OBL-015','e2991307-9018-435c-9e9d-ab247d29b281','Mención en contenido y página web','TC-WEB-LOGO','según convenio',None,None,'Logo y reconocimiento en web'),
 ('OBL-017','e2991307-9018-435c-9e9d-ab247d29b281','Video de presentación como patrocinador oficial','TC-IG-REEL','por convenio',None,None,None),
 ('OBL-018','e2991307-9018-435c-9e9d-ab247d29b281','Participación en eventos y finales','TCP-EVENT-REC','eventos','por_auditar',2,None),
 ('OBL-019','3a0d4246-da2f-4b20-b291-228d89e31108','Presentación como patrocinador oficial en redes','TC-SOC-MENTION','según convenio','por_auditar',None,None),
 ('OBL-020','3a0d4246-da2f-4b20-b291-228d89e31108','Uso de balones en videos profesionales','TCP-FB-VIDEO','por cobertura','por_auditar',None,None),
]
CANT = {r[0]: r[5] for r in rows('COMPROMISOS DIGITALES')}
for obl, ag, desc, aid, freq, aud, entreg, nueva in LIGA:
    cant = CANT.get(obl)
    out.append(f"  update app.sponsor_agreement_items set external_ref={q(obl)}, sponsor_asset_id=(select id from app.sponsor_assets where organization_id={ORG} and external_ref={q(aid)}), frequency={q(freq)}, audit_status={q(aud)}, delivered_quantity=coalesce(delivered_quantity,{num(entreg)}), quantity=coalesce(quantity,{num(cant)}){', description='+q(nueva) if nueva else ''}, updated_at=now() where organization_id={ORG} and agreement_id='{ag}' and description={q(desc)} and external_ref is null;")
    out.append(f"  get diagnostics v_n = row_count; if v_n<>1 and not exists(select 1 from app.sponsor_agreement_items where organization_id={ORG} and external_ref={q(obl)}) then raise exception 'No se encontró el entregable de {obl}'; end if;")
NUEVOS = [ # obl, acuerdo, tipo, descripción, cantidad, asset, frecuencia
 ('OBL-009','192df5b1-8abe-4197-8d29-756e092867a2','advertising','Menciones en transmisiones de finales',None,'TCP-LIV-MENTION','finales'),
 ('OBL-010','192df5b1-8abe-4197-8d29-756e092867a2','activation','Activación en final de torneo nombrado',1,'TCP-EVENT-REC','por final'),
 ('OBL-016','e2991307-9018-435c-9e9d-ab247d29b281','social','Menciones en redes',None,'TC-SOC-MENTION','según convenio'),
]
for obl, ag, tipo, desc, cant, aid, freq in NUEVOS:
    out.append(f"  insert into app.sponsor_agreement_items(organization_id,agreement_id,direction,item_type,description,quantity,sponsor_asset_id,fulfillment_status,sort_order,frequency,external_ref) select {ORG},'{ag}','give','{tipo}',{q(desc)},{num(cant)},(select id from app.sponsor_assets where organization_id={ORG} and external_ref={q(aid)}),'pending',(select coalesce(max(sort_order),0)+1 from app.sponsor_agreement_items where agreement_id='{ag}'),{q(freq)},{q(obl)} where not exists(select 1 from app.sponsor_agreement_items x where x.organization_id={ORG} and x.external_ref={q(obl)});")
out.append("end $carga$;")
print("\n".join(out))

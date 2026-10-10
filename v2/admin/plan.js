/* El plan de un club: cuántos jugadores incluye, cuántos van de más y cuánto
   deja al mes. Lo usan el portal de la plataforma (ingreso) y Administración
   del club ("Tu plan"). No bloquea nada: avisa y cobra los extras. */
// Cuántos jugadores incluye el plan y cuántos van de más. No se bloquea a
// nadie: cada extra se cobra aparte (plan.extraPlayerMxn al mes).
export function usoDelPlan(jugadores, plan) {
  const max = plan?.maxPlayers == null ? null : Number(plan.maxPlayers);
  const activos = Number(jugadores || 0);
  const extra = max == null ? 0 : Math.max(activos - max, 0);
  return { activos, max, extra, extraMxn: extra * Number(plan?.extraPlayerMxn || 0),
    cerca: max != null && extra === 0 && activos >= Math.ceil(max * 0.9) };
}

// Ingreso del mes: el plan (fundador a mitad) más los jugadores extra, que
// van a precio completo.
export function ingresoMensual(clubes, planes) {
  const porCodigo = new Map((planes || []).map(p => [p.code, p]));
  return (clubes || []).reduce((s, c) => {
    const plan = porCodigo.get(c.planCode);
    if (!plan) return s;
    return s + Number(plan.priceMxn || 0) * (c.founder ? 0.5 : 1) + usoDelPlan(c.players, plan).extraMxn;
  }, 0);
}

const pesos=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(Number(n||0));
export function textoDelPlan(p){
  const uso=usoDelPlan(p.activePlayers,{maxPlayers:p.maxPlayers,extraPlayerMxn:p.extraPlayerMxn});
  const precio=p.founder?`${pesos(Number(p.priceMxn)/2)}/mes · club fundador`:`${pesos(p.priceMxn)}/mes`;
  let texto;
  if(uso.max==null)texto=`${uso.activos} jugadores activos. Tu plan no tiene límite.`;
  else if(uso.extra)texto=`${uso.activos} jugadores activos: tu plan incluye ${uso.max}. Los ${uso.extra} de más se cobran a ${pesos(p.extraPlayerMxn)} cada uno (${pesos(uso.extraMxn)} al mes).`;
  else if(uso.cerca)texto=`${uso.activos} de ${uso.max} jugadores. Ya casi llegas al límite; después cada jugador extra cuesta ${pesos(p.extraPlayerMxn)} al mes.`;
  else texto=`${uso.activos} de ${uso.max} jugadores. Te quedan ${uso.max-uso.activos} lugares.`;
  const docs=Number(p.docsPending||0);
  return {precio,texto,barra:uso.max?Math.min(100,Math.round(uso.activos/uso.max*100)):0,tono:uso.extra?'extra':uso.cerca?'cerca':'ok',
    docs:docs?`Completa tu aviso de privacidad: faltan tu domicilio y tu correo de contacto${docs>1?` (${docs} documentos)`:''}.`:''};
}

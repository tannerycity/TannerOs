import assert from 'node:assert/strict';
import test from 'node:test';
import { ID_USO, RUTAS_PERMITIDAS, rolMedible, moduloMedible, iniciarUsoStaff } from '../v2/analitica-uso.js';

test('GA4 de TannerOS es distinto de Marketing',()=>{
  assert.equal(ID_USO,'G-KJN3NJS2YJ');
  assert.notEqual(ID_USO,'G-H485DE37EF');
});
test('solo roles de staff: jamás cuenta Tanner ni Familia',()=>{
  assert.equal(rolMedible('Presidencia'),true);
  assert.equal(rolMedible('Marketing'),true);
  assert.equal(rolMedible('Tanner'),false);
  assert.equal(rolMedible('Familias'),false);
  assert.equal(rolMedible(undefined),false);
});
test('solo módulos estáticos: no URL, ficha, fragmento ni parámetros',()=>{
  const l={hostname:'app.tannerycity.com',pathname:'/jugadores/',search:'',hash:''};
  assert.equal(moduloMedible(l),'jugadores');
  assert.equal(moduloMedible({...l,pathname:'/jugadores/123'}),null);
  assert.equal(moduloMedible({...l,search:'?player=123'}),null);
  assert.equal(moduloMedible({...l,hash:'#expediente'}),null);
  assert.equal(moduloMedible({...l,pathname:'/familias/'}),null);
  assert.equal(moduloMedible({...l,hostname:'tcp.tannerycity.com'}),null);
  assert.equal(moduloMedible({...l,hostname:'tanneros.vercel.app'}),null);
});
test('no añade datos dinámicos a la taxonomía de módulos',()=>{
  for(const [path,code] of Object.entries(RUTAS_PERMITIDAS)) {
    assert.match(path,/^\/[a-z\/-]*$/);
    assert.match(code,/^[a-z_]+$/);
  }
});
test('sin role no arranca seguimiento ni depende del navegador',()=>{
  assert.doesNotThrow(()=>iniciarUsoStaff('Tanner',{mostrarConsentimiento:true}));
});

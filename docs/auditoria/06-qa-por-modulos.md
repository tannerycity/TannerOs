# 06 · QA por módulos

## Cobertura actual

| Script | Qué cubre | Naturaleza |
|---|---|---|
| `qa-static.mjs` | 36 pantallas, 30 rutas, reglas de egress, contratos de evaluación | Barrera arquitectónica |
| `qa-photo-cache.mjs` | Caché de URLs firmadas: hits, misses, duplicados | Funcional |
| `qa-evaluation-guidance.mjs` | Contrato de coaching contextual | Funcional |

**No existen** pruebas unitarias, de integración, E2E ni de API. Las tres
barreras son buenas —impiden regresiones en lugar de describir el pasado— pero
cubren arquitectura, no comportamiento.

Dicho esto: la verificación real de esta sesión se hizo con navegador headless
contra el `app.js`, el markup y el CSS verdaderos, y con transacciones
revertidas contra la base. Ese método funciona, pero **no está automatizado**:
se repite a mano en cada cambio.

## Inventario y riesgo

Prioridad por daño posible, no por tamaño del módulo.

| Módulo | Funciones críticas | Estado | Riesgo | Pruebas hoy | Faltan | Recomendación |
|---|---|---|---|---|---|---|
| **taquilla** | Cobrar, pagar, corte de caja | Operando | **Cobro incorrecto, doble cobro** | Ninguna | Integración + doble envío | **Prioridad 1** |
| **familias** | Estado de cuenta, firmas, beca, gafete | Operando | **Mostrar saldo ajeno; dinero invisible** | Ninguna | E2E + aislamiento entre tutores | **Prioridad 1** |
| finanzas / contabilidad | Conciliación, asignación de pagos | Operando | Descuadre contable | Ninguna | Integración sobre `payment_allocations` | Prioridad 1 |
| jugadores | Expediente, becas, fotos, evaluación | Operando | Foto o beca en el Tanner equivocado | `qa-static` parcial | Integración + permisos | Prioridad 2 |
| usuarios | Alta de accesos, contraseñas | Operando | **Acceso indebido** | Ninguna | Seguridad + roles | Prioridad 2 |
| asistencia | Pasar lista, cubrir categoría | Operando | Lista perdida, sesión duplicada | `qa-static` (egress) | Integración + concurrencia | Prioridad 2 |
| pedidos / catálogo | Pedidos, precios, costos | Operando | Precio o costo equivocado | `qa-static` | Integración | Prioridad 3 |
| academias / programas | Inscripción, cobro por día | Operando | Cobro duplicado | Ninguna | Integración | Prioridad 3 |
| estacionamiento | Gafetes, folios | Operando | Folio duplicado | Ninguna | Integración | Prioridad 3 |
| scouting / prospectos | Captación, conversión | Operando | Duplicados | `qa-static` (egress) | Integración | Prioridad 3 |
| admin | Config, branding, miniaturas | Operando | Config global equivocada | `qa-static` | Humo | Prioridad 3 |
| público (`public-form.js`) | Registro, pedidos, programas | **Cara al mundo** | **Entrada sin autenticar** | `qa-static` (rutas) | **Seguridad + carga** | Prioridad 2 |

## Las 8 pruebas que hay que escribir primero

Elegidas por daño evitado, no por facilidad:

1. **Un tutor no ve al hijo de otro.** `v2_portal_statement`, `v2_portal_progress`
   y `v2_portal_paperwork` con un `player_id` ajeno deben responder
   `Not authorized`. *(Probado a mano esta sesión; hay que fijarlo.)*
2. **El cobro no se duplica con doble clic.** Dos envíos del mismo cobro no
   pueden producir dos pagos.
3. **Un pago revertido y reasignado no se pierde.** Regresión del defecto real
   encontrado: el motor reportaba `1600.00 aplicados` y aplicaba `0`.
4. **No hay recargo para quien ya pagó.** Regresión de los 13 casos del 6 de
   septiembre.
5. **Un Formadores no ve el dinero de una familia.** `can_see_player_money`.
6. **La foto va al Tanner correcto.** Subir con dos fichas abiertas.
7. **Ninguna lista descarga un original.** Ya existe como barrera estática;
   falta la verificación en ejecución.
8. **El formulario público resiste basura.** Archivos que no son imagen, campos
   fuera de rango, envíos repetidos.

## Huecos que no se cubren con pruebas

- **Doble envío**: sólo algunos botones se deshabilitan mientras procesan.
- **Conexión lenta**: no hay reintentos ni indicación de progreso salvo en la
  herramienta de miniaturas.
- **Interrupción a media operación**: el registro público ya lo maneja
  (guarda y reintenta la foto); el resto no.
- **Accesibilidad**: no se auditó. Hay `aria-label` en varios controles, pero
  no hay navegación por teclado verificada ni contraste medido.
- **Compatibilidad entre navegadores**: **este es el hueco que costó caro.** El
  defecto del PNG es exactamente un fallo de compatibilidad que ninguna prueba
  habría atrapado, porque todas corren en Chromium. Hace falta al menos una
  prueba en WebKit.

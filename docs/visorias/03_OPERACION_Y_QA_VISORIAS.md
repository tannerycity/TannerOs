# TANNERY CITY FC | PROTOCOLO OPERATIVO + MATRIZ QA DE VISORÍAS

**Versión 1.0 · Documento de trabajo**. El responsable de seguridad de la sede y el abogado deben aprobarlo antes de operar. La firma nunca sustituye estas medidas.

## A. Checklist físico ANTES de abrir la visoría

- [ ] Organizador jurídico y responsable de la sede identificados; convenio con evaluador y cancha revisado cuando aplique.
- [ ] Tipo de evento, sede, horario, aforo y actividades aprobadas; cantidad de staff y supervisión adecuada a edades.
- [ ] Situación de pólizas/seguros consultada y documentada (club, evaluador, recinto, participantes si se informa); leyenda legal del formulario concuerda con hechos.
- [ ] Condición de superficie: hoyos, objetos peligrosos, porterías ancladas, redes, límites seguros, alumbrado y acceso controlado.
- [ ] Botiquín funcional y personal con formación válida en primeros auxilios; saber qué **no** se debe hacer.
- [ ] Protocolo de emergencia: dirección precisa, acceso de ambulancia, 911, centro de atención de referencia, responsables de llamada y acompañamiento.
- [ ] Agua, pausas, temperatura, lluvia/tormenta y criterios de suspensión; medidas ajustadas a edades.
- [ ] Registro y supervisión de menores: acceso únicamente con consentimiento válido, protocolo de recepción/entrega, acompañamiento seguro, restricción de espacios privados con adultos.
- [ ] Staff instruido sobre incidentes, resguardo de datos de salud y protección infantil; no se permiten fotografías de menores en dispositivos personales fuera de protocolo aprobado.
- [ ] Contactos de emergencia y autorización de tutores accesibles **solo para el staff pertinente**, incluso ante falla de conectividad, sin distribución indiscriminada de fichas médicas.
- [ ] Apertura autorizada por responsable; si falla un control crítico, no iniciar o adaptar/suspender hasta resolver.

## B. Durante una emergencia

1. Suspender actividad y asegurar el área evitando más riesgos.
2. Activar personal capacitado y, si corresponde, 911. No sustituir valoración médica ni realizar maniobras fuera de competencia.
3. Contactar a padres/tutores de forma prioritaria sin retrasar la asistencia urgente.
4. Compartir con servicios sanitarios solo información relevante y por canal autorizado.
5. Registrar secuencia objetiva de hechos, hora, testigos y acciones, sin adjudicar culpas ni modificar registros originales.
6. Mantener privada la información; designar un único portavoz para comunicaciones oficiales.
7. Seguimiento y evaluación de medidas preventivas; conservar evidencia restringida conforme a plazo aprobado.

## C. Después del evento

- [ ] Registrar cierre, asistentes y consentimientos efectivos; nunca modificar documentos históricos.
- [ ] Verificar que fotografías con menores sin permiso no se publiquen; segmentar o difuminar cuando proceda.
- [ ] Entregar al evaluador externo **solo datos permitidos**; guardar registro de qué datos, a quién, cuándo y por qué.
- [ ] Cerrar incidentes con seguimiento y responsables operativos; escalar alertas a dirección.
- [ ] Aplicar política de conservación, controles de acceso y revisión posterior.

## D. Historias de usuario

**HU-01 — Tutor:** Como padre/madre/tutor quiero leer condiciones, registrar salud relevante, elegir uso de imagen y firmar, para autorizar conscientemente.

**HU-02 — Coordinador:** Como coordinador quiero que solo entren menores con consentimiento válido y sin alerta médica pendiente, para proteger su seguridad.

**HU-03 — Asesor legal/auditor:** Quiero reconstruir el contenido exacto, consentimientos, identidad, hora y versión firmados, sin alteraciones, para revisar un expediente fiable.

**HU-04 — Marketing:** Quiero identificar únicamente quién tiene autorización de difusión vigente, para evitar publicar menores no autorizados.

**HU-05 — Scout externo:** Quiero consultar solo datos deportivos cuya transferencia fue autorizada, sin obtener fichas médicas.

**HU-06 — Responsable de privacidad:** Quiero tramitar oposición/revocación/ARCO manteniendo el rastro necesario y sin generar usos futuros indebidos.

## E. Matriz QA / Gherkin — mínimo de 18 escenarios

### TC-01: Sin aceptación de riesgos
```gherkin
Given un padre completó datos y dejó desmarcada la autorización de participación
When intenta enviar el formulario
Then el servidor rechaza la firma y muestra el requisito pendiente
```
### TC-02: Sin advertencia de seguro
```gherkin
Given el evento fue verificado como «sin seguro»
When el tutor no confirma que entendió la ausencia de cobertura
Then no se emite consentimiento firmado
```
### TC-03: Salud sensible sin autorización
```gherkin
Given el formulario recoge información de salud sensible
When falta el consentimiento específico y autenticado para tratarla
Then se bloquea la captura/guardado de dicha información, salvo base legal excepcional documentada
```
### TC-04: Firma vacía
```gherkin
Given las casillas obligatorias están marcadas
When la firma es un lienzo en blanco
Then el servidor no registra el documento como firmado
```
### TC-05: Checkbox falseado vía API
```gherkin
Given la UI indica todas las casillas marcadas
When un cliente malicioso envía accept_participation=false directamente
Then el backend rechaza y no genera expediente firmado
```
### TC-06: Negativa de imagen
```gherkin
Given media_publication=false
When se firma y confirma el registro
Then el menor puede participar y marketing ve «sin autorización de publicación»
```
### TC-07: Revocación de imagen
```gherkin
Given media_publication=true en un consentimiento anterior
When el representante verificado revoca usos promocionales
Then la nueva decisión queda auditada y bloquea nuevos usos desde el momento aplicable
```
### TC-08: Scout externo no autorizado
```gherkin
Given transfer_to_evaluator=false
When un scout intenta acceder a datos deportivos de ese menor por API
Then el acceso se deniega y se registra el evento de seguridad
```
### TC-09: Salud nunca en scouting
```gherkin
Given un evaluador recibió consentimiento para datos deportivos
When solicita datos de alergias, lesiones u otra información clínica
Then se deniega independientemente de la autorización deportiva
```
### TC-10: Acceso horizontal
```gherkin
Given el padre A está autenticado
When intenta descargar el consentimiento del menor de padre B
Then el acceso se deniega
```
### TC-11: Versión antigua
```gherkin
Given el documento de visoría cambia sustancialmente después de mostrarse
When el firmante envía la versión anterior
Then se solicita revisar y aceptar la versión vigente sin firmar silenciosamente la nueva
```
### TC-12: Cambio de cobertura
```gherkin
Given el evento cambió la condición real de seguro
When un organizador intenta reutilizar consentimiento desactualizado
Then el sistema bloquea el flujo y exige nuevo documento aprobado y autorización correspondiente
```
### TC-13: Idempotencia
```gherkin
Given un tutor envía la misma solicitud dos veces por doble toque
When llegan ambas peticiones
Then existe solo un consentimiento exitoso para la operación y sin PDFs inconsistentes
```
### TC-14: PDF fallido
```gherkin
Given el almacenamiento de PDF falla
When se intenta finalizar consentimiento
Then el sistema no anuncia un expediente íntegramente completo y permite recuperación segura
```
### TC-15: Evento no apto
```gherkin
Given la visoría carece de aprobación de protocolo de seguridad
When una familia intenta inscribirse
Then el sistema impide aceptación final y muestra un mensaje apropiado
```
### TC-16: Firma ajena
```gherkin
Given una persona trata de firmar un evento/participante distinto al autorizado
When envía su token o firma
Then se rechaza por vinculación incorrecta de sujeto, evento o verificación
```
### TC-17: Rastreo comercial
```gherkin
Given el usuario informa alergias o condición médica
When termina el flujo
Then ninguna petición a píxeles publicitarios ni telemetría contiene datos sensibles o contenido del consentimiento
```
### TC-18: Expediente inmutable
```gherkin
Given un consentimiento válido fue firmado
When el administrador modifica el texto legal de un evento nuevo
Then el expediente anterior preserva texto, versión, firmas, elecciones y hashes originales
```

## F. Matriz de permisos resumida

| Rol | Estado firmado | PDF de la propia familia | PDF de otras familias | Salud privada | Datos para scouts | Publicación imagen |
|---|---|---|---|---|---|---|
| Tutor verificado | Su menor | Sí | No | Su menor conforme a derechos | N/A | Puede elegir/revocar |
| Coordinador de visoría | Sí, para evento | Solo por necesidad operativa | Según necesidad | Solo alerta operativa; detalle restringido | Según permisos | Solo estado permitido |
| Personal médico/autorizado | Según necesidad | Según necesidad | No general | Sí, por necesidad y justificación | No | No |
| Scout externo | Solo lo necesario | No | No | No | Solo información autorizada | No |
| Marketing | Solo permiso de imagen | No | No | No | No | Solo con autorización vigente |
| Auditor autorizado | Sí | Sí, con razón auditada | Sí, con razón auditada | No por defecto | Solo cuando justificado | Histórico de autorizaciones |
| Presidencia / legal | Según función | Según función | Según función | Excepcional y auditado | Según función | Puede auditar |

## G. Criterios de liberación

**P0 BLOQUEANTE:** falta de consentimiento real, ausencia de seguro mostrada equivocadamente, salud expuesta a personal no autorizado, firma sin prueba suficiente, PDF inconsistente, imagen concedida por defecto, menores admitidos sin control de seguridad.

**P1 ALTA:** control de versiones insuficiente, sin revocación de fotos, sin historial de transferencias a evaluador, errores de accesibilidad o auditoría.

**Definition of Done**: Documento aprobado por asesor legal + permisos auditados + protocolo operativo listo + pruebas críticas pasando + evidencia de descarga del expediente y autenticación + evaluación de seguridad.

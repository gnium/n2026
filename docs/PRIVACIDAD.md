# Privacidad y anonimización

## Garantías

1. **Nada personal en disco ni en base de datos.** El archivo se procesa en memoria; MySQL solo guarda configuración y métricas. El logger descarta claves que puedan contener texto (`mapping`, `texto`, `valor_literal`, `variantes`, `contenido`).
2. **Anonimización por capas antes de cada llamada externa.**
   - Fase A (regex, determinista): DNI, CUIT/CUIL, correos, teléfonos → tokens `[[DNI_n]]`, `[[CUIT_n]]`, `[[EMAIL_n]]`, `[[TEL_n]]`. Ocurre **antes** de la primera llamada a Claude.
   - Fase B (semántica): el skill extractor identifica nombres, sociedades, domicilios, nomenclatura catastral, matrícula, partidas y datos de cónyuges. El servidor los reemplaza por `[[ROL_n]]` en el texto y en la propia extracción. Desde ese momento ningún skill ve un dato real.
   - Verificación: antes de enviar la entrada de los skills 2 a 4 y sobre la minuta generada, se comprueba que no contengan ninguno de los valores reales del mapa. Si aparece uno, el proceso se aborta con `FUGA_DATOS`.
3. **Rehidratación solo al exportar.** Los tokens vuelven a ser datos reales únicamente dentro del `.docx` que se descarga. Inmediatamente después la sesión se destruye (`mapa.clear()`, referencias a `null`, eliminación del `Map`).
4. **Destrucción garantizada** también por: cierre manual (`DELETE /api/sesiones/:id`), inactividad (`SESSION_TTL_MINUTES`, 30 por defecto) y apagado del servidor (`SIGINT`/`SIGTERM`).
5. **La UI solo muestra datos anonimizados.** La vista previa de la minuta, el estudio de títulos y la validación exhiben las marcas `[[...]]`; el navegador nunca recibe el mapa.

## Instrucciones y escritura modelo

La escribana o el escribano puede escribir instrucciones libres y adjuntar una escritura anterior como modelo. Ambos textos se tratan igual que el documento base: pasan por la fase A (regex) con el **mismo mapa de la sesión** (un dato repetido en el documento y en las instrucciones recibe el mismo token) y por la fase B con las entidades que devuelve el extractor. Las entidades de la escritura modelo se marcan con prefijo `MODELO_` porque pertenecen a otro cliente: el redactor tiene la instrucción de reemplazarlas por las marcas del caso actual, y el generador del `.docx` **nunca rehidrata** marcas `MODELO_`; si alguna sobrevive, se convierte en un campo `{{COMPLETAR_...}}`. Los textos originales del modelo y las instrucciones se liberan de memoria apenas termina el extractor.

## Límite que deben conocer la escribana y el escribano

El skill 1 (extractor) necesita leer el texto para reconocer qué es un nombre o un domicilio. Ese texto viaja **una vez, cifrado en tránsito (HTTPS)**, a la API de Anthropic, ya sin DNI, CUIT, correos ni teléfonos (fase A). Los skills 2, 3 y 4 solo reciben datos anonimizados. Recomendaciones:

- Revisar la política de retención de datos de la API de Anthropic para la organización y, si el colegio profesional lo requiere, solicitar retención cero (*zero data retention*) para la clave utilizada.
- No agregar datos innecesarios al borrador (por ejemplo, copias de documentos de identidad completos).
- Si se desea eliminar por completo la exposición de nombres a la API, la evolución natural es reemplazar la fase B por un reconocedor de entidades local (por ejemplo un modelo NER ejecutado en la PC) antes del skill 1. La arquitectura ya separa esa fase para permitirlo sin tocar el resto.

## Excepciones acotadas a la regla de oro

Todo lo anterior sigue valiendo para el pipeline de IA. Hay, deliberadamente, dos excepciones puntuales, pedidas por la escribana o el escribano, cada una en su propia tabla y con su propio contexto de cifrado (`backend/src/utils/cifrado.js`, AES-256-GCM, una llave derivada por contexto a partir de `JWT_SECRET`: comprometer o rotar una no afecta a las demás).

### 1. Índice de protocolo

El Código Civil y Comercial (arts. 299-307) exige numerar correlativamente y foliar cada escritura o acta del protocolo anual, y el índice de fin de año debe listar los comparecientes por su nombre real. `protocolo_escrituras` (`database/07_protocolo.sql`) es la **única tabla de todo el esquema** que guarda datos de partes, y los guarda cifrados (columna `comparecientes_cifrado`, contexto `"protocolo"`): ni un dump de la base expone nombres en texto plano. Es por cuenta (`usuario_id`): cada escribana o escribano ve y gestiona solo su propio protocolo.

Para prellenar el registro con los nombres reales de una sesión recién terminada (antes de descargarla y que se destruya), `GET /api/protocolo/desde-sesion/:sesionId` es la única otra ruta, fuera de `docxBuilder.js`, que lee `sesion.mapa`. Es de solo lectura: no muta ni destruye la sesión, y el registro efectivo en la base ocurre en una llamada `POST /api/protocolo` separada y posterior, con exactamente los datos que la escribana o el escribano confirmó.

**Advertencia operativa:** rotar `JWT_SECRET` sin haber exportado antes el índice deja los nombres de comparecientes permanentemente ilegibles (números, fechas y folios se conservan). Exportar el índice a `.docx` antes de rotar la clave.

### 2. Guardar y continuar después

Por defecto una sesión de trabajo vive solo en memoria y se destruye al descargar, cerrar o por inactividad (ver más arriba). `sesiones_guardadas` (`database/08_sesiones_guardadas.sql`) es el único otro lugar donde datos de sesión (incluido el mapa token→valor real) pueden llegar a MySQL, y **solo si la escribana o el escribano lo pide explícitamente** con el botón "Guardar y continuar después" — nunca automático, nunca al cerrar la pestaña. El contenido viaja cifrado (contexto `"sesion_guardada"`), no se puede guardar mientras la sesión está `en_curso` (el pipeline la sigue mutando), vence solo (`SESIONES_GUARDADAS_TTL_DIAS`, 7 días por defecto, con un barrido periódico) y se borra al reanudar o al descartarla explícitamente.

## Excepción sin cifrar: agenda, notas y biblioteca de modelos

Estas tres tablas (`turnos`, `notas`, `modelos_biblioteca`, `database/09_agenda_notas_biblioteca.sql`) son una excepción **distinta y deliberadamente menos estricta** que las dos anteriores. La diferencia de fondo: no son datos que el pipeline de IA extraiga de un documento, sino datos de gestión de la práctica que la escribana o el escribano tipea o sube a mano (el título de un turno, una nota, una escritura modelo propia). La garantía de "cero PII" del pipeline de IA descripta arriba **no cambia en nada**: sigue sin persistirse un solo dato de las partes de un caso que se procesa con IA.

Dicho esto, hay que ser exactos sobre lo que sí cambia: a diferencia de `protocolo_escrituras` y `sesiones_guardadas`, estas tres tablas **no están cifradas**. Se guardan en texto plano a propósito, para poder buscar y filtrar (por ejemplo, turnos por rango de fechas) sin tener que descifrar fila por fila. Eso significa que:

- El título y las notas de un turno pueden contener el nombre de un cliente, y un dump de la base los expone en texto plano.
- Una nota puede contener cualquier detalle de un caso que la escribana o el escribano decida anotar.
- La **biblioteca de modelos** es la más sensible de las tres: guarda el **texto completo** de una escritura anterior, con los datos reales de ese cliente, para poder reutilizarla como modelo de redacción sin volver a subir el archivo cada vez. Al usarse en una nueva sesión, ese texto pasa por la misma anonimización que un archivo recién subido (ver "Instrucciones y escritura modelo" más arriba) antes de llegar a cualquier IA — pero en la base de datos queda sin cifrar.

**Recomendación operativa:** si el servidor de MySQL no es de entera confianza de la escribanía (por ejemplo, está en un proveedor de terceros sin control físico), activar cifrado de disco a nivel de infraestructura para estas tablas, o evaluar migrarlas al mismo esquema de cifrado por contexto que ya usan `protocolo_escrituras` y `sesiones_guardadas` (`backend/src/utils/cifrado.js`) si la búsqueda por texto deja de ser necesaria.

## Excepción mixta: clientes, expedientes y presupuestos

Las tablas `clientes`, `expedientes`, `expediente_partes`, `tareas` y `presupuestos` (`database/10_clientes_expedientes_presupuestos.sql`) son la capa de gestión de la práctica: datos que la escribana o el escribano carga a mano, no datos extraídos de un documento por el pipeline. Igual que en la excepción anterior, la garantía del pipeline no cambia. La diferencia es que acá hay identificadores directos de clientes, así que se aplica una regla **mixta**:

| Campo | Tabla | Cómo se guarda | Propósito | Retención y borrado |
|---|---|---|---|---|
| `nombre`, `tipo`, `observaciones` | `clientes` | Texto plano | Buscar y listar clientes; identificar partes de un expediente | Hasta que la cuenta borre el cliente; el borrado elimina sus vínculos (`expediente_partes`) y deja `cliente_id = NULL` en presupuestos |
| `datos_cifrado` (DNI, CUIT, domicilio, teléfono, correo, estado civil, nacionalidad) | `clientes` | **Cifrado** AES-256-GCM, contexto `"cliente"` | Presupuestos (PDF) y contacto (WhatsApp) | Se borra con el cliente. Rotar `JWT_SECRET` los deja ilegibles (la fila queda, marcada como no legible) |
| `caratula`, `observaciones` | `expedientes` | Texto plano | Identificar la carpeta (puede contener una dirección: la UI lo advierte) | Hasta que la cuenta borre el expediente; el borrado elimina sus tareas, vínculos y deja `expediente_id = NULL` en presupuestos |
| `descripcion`, `responsable` | `tareas` | Texto plano | Checklist de trabajo. Las tareas `origen = checklist` vienen del skill 4 y del skill 2, que solo ven datos anonimizados | Se borran con el expediente |
| `items`, `total`, `notas` | `presupuestos` | Texto plano | Montos por concepto. El nombre del cliente **no se copia**: el PDF lo lee del cliente al generarse | Hasta que la cuenta lo borre |
| `ejecucion_id`, `protocolo_id` | `expedientes` | Referencias | Trazabilidad al pipeline y al protocolo | `SET NULL` si se borra el destino |

Camino de lectura de sesión nuevo: `POST /api/expedientes/:id/tareas/desde-sesion/:sesionId` lee `checklist_previo_firma` y `requisitos_previos` de una sesión viva. Ambos son texto producido sobre datos anonimizados, sin nombres ni identificadores; no se lee `sesion.mapa`. Para prellenar clientes a partir de los comparecientes se reutiliza `GET /api/protocolo/desde-sesion/:sesionId`, que ya existía.

## Cumplimiento y caja: comprobantes, cuenta corriente, UIF y ARCA

Las tablas de `database/11_caja_comprobantes_uif.sql` cubren dos obligaciones recurrentes de la escribanía: cobrar (cuenta corriente, comprobantes, factura electrónica) y cumplir con la UIF (legajo del cliente, recaudos por expediente, reportes). Ninguna de ellas toca el pipeline: la garantía de anonimización se mantiene. El mapa de datos:

| Campo | Tabla | Cómo se guarda | Propósito | Retención y borrado |
|---|---|---|---|---|
| `datos_cifrado` (actividad económica, origen de fondos, detalle PEP, nacionalidad, beneficiarios finales, observaciones) | `uif_legajos` | **Cifrado**, contexto `"uif"` | Debida diligencia del cliente (Res. UIF 242/2023) | Se borra con el cliente (`ON DELETE CASCADE`) |
| `nivel_riesgo`, `diligencia`, `es_pep`, `jurisdiccion_riesgo`, `actualizado_en`, `proxima_revision` | `uif_legajos` | Texto plano | Alertas de legajo vencido y filtros; no identifican a nadie sin la fila de `clientes` | Se borran con el cliente |
| `documentacion` | `uif_legajos` | JSON en claro | Checklist de documentos presentados: solo el nombre del documento, si se presentó y cuándo. **No** se guardan números ni copias | Se borra con el cliente |
| `actividad`, `monto`, `moneda`, `supera_umbral`, `recaudos`, `alertas`, `notas` | `uif_expedientes` | Texto plano | Recaudos por expediente y umbral. El texto de los recaudos lo produce la IA a partir de una entrada **sin nombres ni identificadores** (ver abajo) | Se borra con el expediente |
| `tipo`, `periodo`, `fecha`, `referencia`, `notas` | `uif_eventos` | Texto plano | Constancia de reportes sistemáticos, ROS, autoevaluación, capacitación | No se borra con el expediente (`SET NULL`): es la prueba de cumplimiento de la cuenta |
| `receptor_cifrado` (nombre, documento o CUIT, domicilio, condición IVA del receptor al emitir) | `comprobantes` | **Cifrado**, contexto `"comprobante"` | Snapshot para reimprimir el PDF aunque el cliente cambie o se borre | Se conserva al borrar el cliente (`cliente_id = NULL`). Un comprobante emitido no se borra: se anula con motivo |
| `items`, `total`, `moneda`, `numero`, `cae`, `arca_resultado` | `comprobantes` | Texto plano | Numeración correlativa por tipo y punto de venta, CSV para el contador, CAE de ARCA | Igual que el anterior |
| `concepto`, `monto`, `medio_pago`, `referencia` | `movimientos` | Texto plano | Cuenta corriente por cliente. El concepto lo escribe la escribana o es el número del comprobante/presupuesto | `cliente_id` es obligatorio: los movimientos se borran con el cliente |
| `arca_cert_cifrado`, `arca_clave_cifrado` | `configuracion_fiscal` | **Cifrado**, contexto `"fiscal"` | Certificado y clave privada para WSAA/WSFEv1. La API nunca los devuelve: solo "cargado el …" | Se borran con `DELETE /api/configuracion-fiscal/credenciales` o al borrar la cuenta |
| `cuit`, `razon_social`, `domicilio_fiscal`, `condicion_iva`, `punto_venta` | `configuracion_fiscal` | Texto plano | Encabezado de los comprobantes; datos públicos del emisor | Con la cuenta |
| `uif_smvm_ars`, `uif_umbral_smvm` | `configuracion` | Texto plano | Parámetros del umbral, editables por la administradora. **Orientativos**: no son la norma | — |

**Recaudos con IA (skill `uif_recaudos`)**: la entrada que se envía al proveedor lleva solo tipo de acto, actividad UIF, monto y moneda, si supera el umbral, y por cada parte su rol, tipo (persona/sociedad), nivel de riesgo, diligencia, si es PEP, si hay jurisdicción de riesgo y si el legajo está vencido. La nacionalidad, la actividad económica y el origen de fondos pasan por `presanear` (el mismo anonimizador del pipeline) antes de salir. Nunca se envían nombre, documento, CUIT, domicilio ni beneficiarios finales. La ejecución queda en `ejecuciones`/`ejecuciones_skills` con su costo, sin la entrada ni la salida.

**ARCA**: la comunicación con `wsaa`/`wsfev1` lleva CUIT del emisor, tipo y número de documento del receptor e importes, que es exactamente lo que la factura electrónica exige. No pasa por ningún proveedor de IA. El ticket de acceso (TA) se cachea en memoria del proceso por cuenta y entorno hasta 10 minutos antes de vencer.

## Equipo: qué se comparte y qué no

El equipo (`database/13_equipo.sql`) **no junta los datos de las cuentas**. Cada cuenta sigue siendo dueña de sus clientes, expedientes, agenda, caja y protocolo; la columna `usuario_id` de cada tabla no cambió. Lo que el equipo agrega es:

| Qué | Dónde | Quién lo ve |
|---|---|---|
| Rol (`titular` / `escribano` / `empleado`) | `equipo_miembros` | El equipo. El rol **reserva pantallas enteras**: con rol `empleado`, el servidor rechaza (403) protocolo, caja, comprobantes, datos fiscales y UIF, y la interfaz no los muestra |
| Invitaciones | `equipo_invitaciones` | Solo la titular. Se guarda el hash del token, nunca el token; vencen a los 7 días y solo las acepta el correo al que fueron dirigidas |
| Expediente compartido | `expediente_colaboradores` | Solo quien lo recibe. El dueño elige de a un expediente por vez y con qué permiso (`lectura` o `edicion`) |
| Notas marcadas como compartidas | `notas.compartida` | Los integrantes del equipo (antes: toda la instalación) |
| Turnos marcados como del equipo | `turnos.compartido` | Los integrantes del equipo, en modo lectura |
| Métricas por integrante | Se calculan al vuelo | Solo la titular. Son **conteos y totales** (expedientes, tareas, turnos, documentos, comprobantes, cobrado en pesos): ningún contenido de un expediente, cliente o documento sale de la cuenta que lo creó |

Un expediente compartido muestra al colaborador la carátula, las observaciones, el estado, las tareas y los nombres de las partes (solo el nombre: el DNI, el CUIT, el domicilio y el teléfono siguen cifrados y solo los descifra la cuenta dueña del cliente). **No** se comparten los presupuestos, los comprobantes, la ficha UIF ni el vínculo con el protocolo. Quitar a alguien del equipo le saca el acceso a lo compartido y no borra nada suyo.

## Integraciones con Google

Es la primera función del producto que puede sacar datos de la escribanía hacia un tercero, así que está construida para que eso sea siempre una decisión explícita y reversible:

- **Viene apagada dos veces.** No funciona hasta que (1) la titular carga el `client_id` y el `client_secret` de un proyecto de Google Cloud propio de la escribanía, y (2) cada cuenta conecta su propia cuenta de Google. Ninguna cuenta queda conectada por decisión de otra.
- **Cada destino se activa por separado** (agenda, Gmail, comprobantes a Drive, escrituras a Drive). Mientras estén apagados, no sale nada.
- **Alcances mínimos**: `calendar.events` (crear y editar eventos, no leer el resto del calendario), `gmail.send` (enviar; **no** permite leer la casilla) y `drive.file` (solo los archivos que crea esta app; no ve el resto del Drive).

Qué viaja con cada opción activada:

| Opción | Qué se envía a Google | Qué **no** se envía |
|---|---|---|
| Agenda → Calendar | Título del turno, fecha, duración y estado | Las notas del turno no viajan como dato aparte; no se envían clientes ni expedientes |
| Enviar por Gmail | El PDF que usted elige mandar (presupuesto o comprobante) y el correo del destinatario | Nada más; el correo sale desde su propia casilla y queda en sus Enviados |
| Comprobantes → Drive | El PDF del comprobante | — |
| Escrituras → Drive | El `.docx` final. **Atención**: ese documento ya tiene los datos reales de las partes, porque es el que se firma | — |

| Dato | Dónde | Cómo se guarda |
|---|---|---|
| `refresh_token` y `access_token` de cada cuenta | `google_cuentas` | **Cifrados**, contexto `"google"`. Rotar `JWT_SECRET` los deja ilegibles y hay que reconectar |
| `client_secret` del proyecto | `configuracion` | **Cifrado**, contexto `"google"`. La API nunca lo devuelve |
| Envíos hechos por Gmail | `google_envios` | Solo cuenta, tipo, id del comprobante y id del mensaje de Gmail. **No se guarda el destinatario** |
| Id del evento y del archivo | `turnos.google_evento_id`, `comprobantes.drive_archivo_id` | Referencias, para no duplicar |

Desconectar revoca el permiso en Google, borra los tokens y corta la sincronización. Lo que ya se subió a Calendar o Drive queda en la cuenta de Google de esa persona: la app no lo borra.

**El pipeline de IA no cambia.** La regla de oro sigue igual: los datos de las partes se anonimizan antes de cualquier análisis y no se persisten. Las integraciones actúan sobre documentos ya terminados y a pedido expreso de la persona.

## Qué queda en MySQL después de una ejecución

Ejemplo real de una fila de `ejecuciones`:

```
session_uuid: 3f1c...-...   estado: completada   tipo_acto_detectado: compraventa
bytes_entrada: 48213        entidades_anonimizadas: 11
tokens_entrada: 41230       tokens_salida: 9870   duracion_ms: 184000
```

Nada de esto permite reconstruir el documento ni identificar a las partes.

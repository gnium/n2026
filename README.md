# Doy Fe

> Nombre del producto desde septiembre de 2026 (antes *Notarius 2026*). El nombre del repositorio, la base de datos `notarius` y la cookie `notarius_sesion` se mantienen para no romper instalaciones existentes.

Aplicación web monousuario para una escribana o un escribano. Se arrastra un archivo `.doc`/`.docx` con borradores o antecedentes, el sistema lo procesa con la API de Claude a través de cuatro *skills* encadenados y devuelve una minuta de escritura en `.docx` con anexos de estudio de títulos y control fiscal/registral.

**Regla central de privacidad:** los datos de las partes (nombres, DNI, CUIT, domicilios, datos catastrales) nunca se guardan en la base de datos ni en disco. Viven solo en la memoria del servidor, dentro de una sesión que se destruye al descargar el documento, al cerrarla o por inactividad. Hay dos excepciones explícitas y acotadas, siempre a pedido de la escribana o el escribano: el **índice de protocolo** (nombres de comparecientes, cifrados) y **"Guardar y continuar después"** (sesión cifrada, vence sola). Ver [docs/PRIVACIDAD.md](docs/PRIVACIDAD.md).

---

## 1. Plan de ejecución

| Fase | Entregable | Estado |
|---|---|---|
| 0. Diseño | Arquitectura, flujo de anonimización, esquema MySQL | Hecho ([docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)) |
| 1. Base de datos | `database/01_schema.sql`, `database/02_seed.sql` (skills, plantillas, auditoría sin PII) | Hecho |
| 2. Backend | Express + multer (memoria) + parser `.doc/.docx` + anonimizador + integrador Claude + pipeline + generador `.docx` | Hecho, probado sin red (`npm run check`) |
| 3. Frontend | React/Vite: chat asistente, drag & drop, pipeline visual, vista previa anonimizada, descarga | Hecho, compila |
| 4. Puesta en marcha local | Docker Compose (sección 3) y manual (sección 4) | Hecho, probado de punta a punta en Docker en modo simulado |
| 5. Primera corrida real | Cargar `ANTHROPIC_API_KEY` de console.anthropic.com, procesar un antecedente real y ajustar prompts/plantillas desde la tabla `skills` | Pendiente (requiere clave de API, ver sección 3) |
| 6. Ajuste fino | Afinar prompts por jurisdicción, agregar plantillas (hipoteca, permuta, cesión), pantalla de edición de skills | Siguiente iteración |
| 7. Gestión de la práctica | Agenda, notas, biblioteca de modelos (3.7); clientes, expedientes, presupuestos (3.8); caja, comprobantes, ARCA y UIF (3.9) | Hecho |

### Pipeline de skills (secuencial)

1. `extractor_antecedentes`: identifica acto, partes, inmueble, tracto y **marca las entidades sensibles**. Es el único skill que ve el texto (ya sin DNI/CUIT/mails/teléfonos, que se ocultan por regex antes de enviar nada).
2. `analista_estudio_titulos`: reconstruye el tracto sucesivo y detecta riesgos jurídicos. Solo ve datos anonimizados.
3. `redactor_minuta_escritura`: redacta la minuta con la plantilla de la base de datos. Escribe marcas `[[VENDEDOR_1]]`, nunca datos reales.
4. `validador_fiscal_registral`: certificados, impuestos, tasas, regímenes de información, checklist previo a la firma.

Al descargar, el servidor reemplaza las marcas por los datos reales dentro del `.docx` y destruye la sesión.

---

## 2. Estructura del proyecto

```
notarius2026/
├── database/
│   ├── 01_schema.sql          # tablas: skills, plantillas, ejecuciones, ejecuciones_skills, auditoria, configuracion
│   ├── 02_seed.sql            # prompts de los 4 skills + 3 plantillas notariales
│   ├── 07_protocolo.sql       # protocolo_escrituras (EXCEPCION: unica tabla con datos de partes, cifrados)
│   ├── 08_sesiones_guardadas.sql # sesiones_guardadas (EXCEPCION: opt-in, cifrada, con vencimiento)
│   ├── 09_agenda_notas_biblioteca.sql # turnos, notas, modelos_biblioteca (EXCEPCION: sin cifrar, gestion de la practica)
│   └── 10_clientes_expedientes_presupuestos.sql # clientes (identificadores cifrados), expedientes, expediente_partes, tareas, presupuestos
├── backend/
│   ├── src/server.js          # Express, CORS, helmet, rutas
│   ├── src/config/            # env.js, db.js (pool mysql2)
│   ├── src/routes/            # sesiones.js (subida, SSE, descarga, cierre, guardar), protocolo.js, sesionesGuardadas.js, configuracion.js (skills, plantillas)
│   ├── src/middleware/        # upload.js (multer en memoria), errorHandler.js
│   ├── src/services/
│   │   ├── documentParser.js  # .docx (mammoth) y .doc (word-extractor)
│   │   ├── anonymizer.js      # fases A (regex), B (entidades del extractor) y C (rehidratación)
│   │   ├── sessionStore.js    # sesiones en memoria con TTL y destrucción
│   │   ├── claudeClient.js    # SDK @anthropic-ai/sdk: streaming, salida estructurada, fallbacks
│   │   ├── claudeMock.js      # modo simulado (sin clave de API)
│   │   ├── pipeline.js        # orquestación de los 4 skills
│   │   ├── docxBuilder.js     # genera el .docx final (librería docx)
│   │   ├── protocolo.js / protocoloDocx.js  # indice de protocolo (cifrado) y su exportacion .docx
│   │   ├── sesionesGuardadas.js # guardar/reanudar sesiones (cifrado, TTL, barrido)
│   │   ├── turnos.js          # agenda: CRUD + barrido de recordatorios por email cada 5 min
│   │   ├── notas.js           # notas propias/compartidas entre cuentas de la instalacion
│   │   ├── bibliotecaModelos.js # escrituras modelo propias, reutilizables entre sesiones
│   │   ├── clientes.js        # CRM: nombre en claro, identificadores cifrados (contexto "cliente")
│   │   ├── expedientes.js     # carpetas con partes, tareas (manuales o desde el checklist de la sesion) y vinculos
│   │   ├── presupuestos.js / presupuestoPdf.js # presupuestos correlativos y su PDF (pdfkit)
│   │   ├── movimientos.js     # cuenta corriente: cargos automaticos (presupuesto/comprobante), pagos, resumen, CSV
│   │   ├── comprobantes.js / comprobantePdf.js # recibos, notas de honorarios y facturas (CAE); receptor cifrado
│   │   ├── configuracionFiscal.js # datos del emisor y credenciales ARCA cifradas (contexto "fiscal")
│   │   ├── arca.js            # adaptador WSAA (TRA + CMS con node-forge) y WSFEv1 (FEDummy, ultimo autorizado, FECAESolicitar)
│   │   ├── uif.js / uifIA.js  # legajo KYC cifrado (contexto "uif"), ficha por expediente, alertas, eventos; recaudos con IA anonimizada
│   │   └── auditoria.js       # escritura en MySQL, solo metadatos
│   ├── src/skills/            # schemas.js (Zod), repositorio.js (lectura de MySQL)
│   ├── scripts/initDb.js      # crea BD + seed sin necesitar el cliente mysql
│   └── scripts/smokeTest.js   # prueba local sin red ni BD
├── frontend/
│   ├── src/                   # App.jsx (shell: barra lateral + barra superior), api.js, styles.css (tokens, tema claro/oscuro/sistema)
│   │                          # components/{DropZone,Pipeline,ChatLog,ResultPanel,Protocolo,RegistrarProtocoloModal,SesionesGuardadasPicker,Agenda,Notas,BibliotecaModelos,
│   │                          #             Clientes,Expedientes,PresupuestoModal,GuardarEnExpedienteModal,Caja,Comprobantes,ComprobanteModal,
│   │                          #             ConfiguracionFiscal,Uif,UifLegajo,UifExpediente,ParametrosUif,Iconos,TemaToggle}.jsx
│   └── nginx.conf             # SPA + proxy /api (Docker)
├── ejemplos/antecedente-ejemplo.docx   # documento ficticio para probar
├── docker-compose.yml         # db + backend + frontend
└── docs/                      # ARQUITECTURA.md, PRIVACIDAD.md
```

---


## 3. Despliegue con Docker (recomendado para probar)

Requiere Docker Desktop (macOS/Windows) o Docker Engine + Compose v2.

```bash
cp .env.example .env        # opcional: completar ANTHROPIC_API_KEY
docker compose up --build   # primera vez tarda 1-2 minutos
```

Abrir **http://localhost:8080**. Hay un documento de prueba con datos ficticios en `ejemplos/antecedente-ejemplo.docx` para arrastrar.

Qué levanta:

| Servicio | Imagen | Puerto en la PC | Detalle |
|---|---|---|---|
| `db` | mysql:8.4 | 3307 | Ejecuta `database/*.sql` automáticamente en el primer arranque (volumen `db_data`). |
| `backend` | node:20-alpine | 3001 | Espera a MySQL, arranca Express. |
| `frontend` | nginx:1.27-alpine | 8080 | Sirve la SPA compilada y hace proxy de `/api` al backend (SSE incluido). |

Comandos útiles:

```bash
docker compose logs -f backend          # ver el pipeline en vivo
docker compose down                     # detener
docker compose down -v                  # detener y borrar la base (vuelve a sembrar al subir)
docker compose up --build -d backend    # reconstruir solo el backend tras editar código
```

### Modo simulado vs. Claude real

- Si `ANTHROPIC_API_KEY` está vacía, el backend arranca en **modo simulado**: los cuatro skills devuelven salidas de prueba con una heurística local, sin llamar a ninguna API. Sirve para probar la interfaz, el pipeline, la anonimización y el .docx. La cabecera de la app lo indica en naranja y el chat lo avisa.
- Con una clave válida en `.env`, `docker compose up -d backend` pasa a **Claude real** (`claude-opus-5` por defecto). La cabecera muestra "Claude conectado".
- Se puede forzar con `CLAUDE_MODE=mock` o `CLAUDE_MODE=real`.

### Evaluar el criterio jurídico del modelo con un examen real

En `ejemplos/examen-notarios-peru-2024-c.json` está transcripto el examen oficial de acceso a la función notarial del Perú (abril 2024, opción C, 60 preguntas con clave de respuestas, fuente gob.pe). El script envía cada pregunta a Claude y mide aciertos por materia. Requiere clave de API.

```bash
# con Docker (el directorio ejemplos/ está montado en el contenedor)
docker compose exec backend node scripts/evalExamen.js /app/ejemplos/examen-notarios-peru-2024-c.json
# sin Docker
cd backend && node scripts/evalExamen.js ../ejemplos/examen-notarios-peru-2024-c.json --limite 10
```

Opciones: `--modelo`, `--esfuerzo low|medium|high|xhigh|max`, `--limite N`, `--paralelo N`. Es derecho peruano, así que mide conocimiento general del modelo, no el pipeline argentino de la app.

### Evaluar con material argentino

No hay exámenes notariales argentinos publicados con clave de respuestas: el concurso de CABA (Ley 404) es un caso práctico de cuatro horas en el que se redacta una escritura completa, y los casos no se difunden. Por eso hay dos recursos argentinos en `ejemplos/`:

- `consultas-notariales-pba-can121.json`: 27 consultas reales de escribanos con el dictamen de la Asesoría Notarial del Colegio de Escribanos de la Provincia de Buenos Aires (CAN 121, 2015). `evalConsultas.js` hace responder a Claude y un segundo llamado actúa de juez contra el dictamen (0/1/2). Requiere clave.
- `caso-practico-caba.docx` + `caso-practico-caba.esperado.json`: caso al estilo del examen de CABA con datos ficticios y once vicios/requisitos tomados de consultas reales (donación a extraño, tracto interrumpido, asentimiento conyugal, embargo caducado, hipoteca sin cancelar, ITI, COTI, UIF...). `evalCaso.js` lo sube al pipeline real de la app y cuenta cuántos hallazgos aparecen en el estudio de títulos y la validación, y verifica que ningún dato real llegue al navegador. Funciona en modo simulado (solo mecánica y privacidad) y en modo real (calidad).

```bash
cd backend
node scripts/evalCaso.js --base http://localhost:8080          # contra el stack Docker
docker compose exec backend node scripts/evalConsultas.js /app/ejemplos/consultas-notariales-pba-can121.json --limite 5
```

### Sobre las credenciales

La app llama a la **API de Anthropic** (Messages API) mediante el SDK oficial. Eso requiere una clave `sk-ant-...` creada en https://console.anthropic.com, que se factura por uso y es independiente de la suscripción **Claude Pro**. Claude Pro cubre claude.ai y Claude Code, pero no habilita la API, y los tokens de sesión de Claude Code no pueden usarse desde aplicaciones propias. Pasos:

1. Entrar a console.anthropic.com, crear una organización si no existe y cargar crédito (alcanza con poco para probar).
2. API Keys → Create Key → copiar la clave en `ANTHROPIC_API_KEY=` del `.env`.
3. `docker compose up -d backend` y verificar http://localhost:8080/api/salud → `"modo":"real"`.

## 4. Despliegue local sin Docker (macOS / Windows / Linux)

### 3.1 Requisitos

- **Node.js 20 o superior** (probado con 20.18). Descarga: https://nodejs.org (versión LTS).
- **MySQL 8** (o MariaDB 10.6+). Opciones fáciles:
  - macOS: `brew install mysql && brew services start mysql`
  - Windows: instalador de https://dev.mysql.com/downloads/installer/ o **XAMPP**.
  - Cualquiera: Docker → `docker run --name notarius-mysql -e MYSQL_ROOT_PASSWORD=root -p 3306:3306 -d mysql:8`
- Una **clave de API de Anthropic** (https://console.anthropic.com → API Keys).

### 3.2 Base de datos

Opción A (recomendada, sin cliente `mysql`): el script del backend crea la base y carga el seed.

```bash
cd backend
cp .env.example .env
# Editar .env: DB_USER / DB_PASSWORD con un usuario que pueda crear bases (por ejemplo root).
npm install
npm run db:init
```

Salida esperada:

```
Ejecutando 01_schema.sql... ok
Ejecutando 02_seed.sql... ok
Base lista: 4 skills, 3 plantillas.
```

Opción B (con cliente `mysql`; el flag de charset evita que los acentos de los textos legales se guarden mal):

```bash
mysql --default-character-set=utf8mb4 -u root -p < database/01_schema.sql
mysql --default-character-set=utf8mb4 -u root -p < database/02_seed.sql
# repetir para cada archivo nuevo que se agregue en database/ (03_*.sql, 04_*.sql, ...)
```

Si prefieres un usuario dedicado en lugar de root:

```sql
CREATE USER 'notarius'@'localhost' IDENTIFIED BY 'notarius';
GRANT ALL PRIVILEGES ON notarius.* TO 'notarius'@'localhost';
FLUSH PRIVILEGES;
```

y en `.env` usa `DB_USER=notarius`, `DB_PASSWORD=notarius`. Para `npm run db:init` con usuario dedicado, agrega `DB_ROOT_USER=root` y `DB_ROOT_PASSWORD=...` al `.env` (solo los usa ese script).

### 3.3 Backend

```bash
cd backend
# En .env completar: ANTHROPIC_API_KEY=sk-ant-...
npm run check      # prueba local: anonimizador, esquemas y generador .docx (no usa red)
npm run dev        # http://localhost:3001
```

Comprobación: abrir http://localhost:3001/api/salud → debe responder `{"ok":true,"credencialesClaude":true,...}`.

### 3.4 Frontend

En otra terminal:

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Abrir http://localhost:5173. El indicador superior derecho debe decir **"Servidor listo"**.

### 3.5 Uso

1. Arrastrar el **documento base** (`.doc`/`.docx`: borrador, antecedentes, título) a la zona punteada, **o** hacer clic en "Escribir los antecedentes" para tipear los hechos del caso directamente cuando no hay un borrador en un archivo.
2. Elegir qué generar: **Redactar la escritura**, **Estudio de títulos**, **Análisis completo** o **Certificación de firmas**. Opcionalmente escribir **antecedentes** adicionales, **instrucciones** libres (acto, precio, forma de pago, qué revisar) y adjuntar una **escritura modelo propia** para que la minuta siga su estructura y estilo en lugar de la plantilla estándar.
3. Seguir el avance en "Etapas del análisis" y en el chat. Puede tardar varios minutos.
4. Revisar las pestañas disponibles (vista previa anonimizada). Si el resultado no convence, **pedir una mejora** (ver más abajo) antes de descargar.
5. **Descargar .docx**. El archivo contiene los datos reales; la sesión se borra del servidor en ese momento.

Qué corre en cada modo:

| Modo | Skills | Salida |
|---|---|---|
| Redactar la escritura | extractor → redactor → validador fiscal/registral | Minuta + anexo de validación |
| Estudio de títulos | extractor → analista | Informe de tracto y riesgos |
| Análisis completo | los cuatro | Minuta + estudio + validación |
| Certificación de firmas | extractor → redactor de certificación | Acta de requerimiento + certificación + control de personería |

**Antecedentes escritos.** Cuando no hay un borrador en un archivo (o para completar uno que sí existe), el cuadro "Antecedentes escritos" del configurador acepta el relato de los hechos en texto libre: partes, inmueble, precio, título y cualquier antecedente relevante. Se combina con el archivo si ambos están presentes, y pasa por la misma anonimización antes de llegar a cualquier modelo de IA. Sirve para cualquiera de los cuatro modos, incluida la certificación de firmas (por ejemplo, para describir el poder que se va a certificar sin adjuntarlo).

**Certificación de firmas.** Se puede iniciar sin documento o arrastrando el instrumento cuyas firmas se certifican. Tiene dos modalidades: **a título personal** (el firmante actúa por sí) y **con representación** (el firmante actúa por una sociedad u otra persona: se cargan la representada, el carácter invocado y los documentos habilitantes). El resultado incluye el acta para el libro de requerimientos, el texto de la certificación, la lista de documentos habilitantes con su estado y los controles de identidad (art. 306 CCyC), facultades (arts. 358 y 375 CCyC, art. 58 LGS), vigencia y legalización. Los datos de firmantes y sociedad cargados en el formulario pasan por la misma anonimización que los documentos.

Las instrucciones, los antecedentes escritos y la escritura modelo pasan por la misma anonimización que el documento. Las marcas de la escritura modelo (`[[MODELO_...]]`, datos de otro cliente) nunca se rehidratan en el documento final.

### 3.5 bis Pedir otra versión (iterar sobre el resultado)

Con un resultado ya generado, abajo del todo aparece "¿Quiere ajustar el resultado?": un cuadro de texto para describir el cambio (por ejemplo *"agregar el certificado catastral"*, *"revisar la cláusula de posesión"*, *"faltó considerar el embargo"*) y el botón **Generar nueva versión**. No hace falta volver a cargar el documento ni repetir instrucciones anteriores.

Por detrás, se conserva la extracción original (no se vuelve a anonimizar el documento) y se vuelven a correr los demás skills del modo, cada uno viendo su propio resultado anterior más el pedido, para refinar en vez de empezar de cero. Si el pedido menciona un dato sensible nuevo que no estaba en el caso original (un nombre, un DNI), un paso adicional lo detecta y lo anonimiza antes de usarlo, igual que hace el extractor con el documento; si ese análisis falla, la iteración sigue adelante ignorando el pedido en lugar de arriesgarse a exponer el dato. Se puede repetir tantas veces como haga falta; el panel de resultados muestra el número de versión, y cada llamada queda registrada por separado en **Consumo**, así que iterar varias veces sí se refleja en el costo total.

### 3.6 Producción local (una sola URL)

```bash
cd frontend && npm run build          # genera frontend/dist
```

Servir `frontend/dist` con cualquier servidor estático (o agregar `app.use(express.static("../frontend/dist"))` en `backend/src/server.js`) y ajustar `FRONTEND_ORIGIN` en `.env`.

### 3.7 Agenda, notas y biblioteca de modelos

Tres pantallas de gestión de la práctica, independientes del pipeline de IA, accesibles desde los botones de la cabecera:

- **Agenda**: calendario mensual o semanal de turnos, con recordatorio por email configurable (15 min a 2 días antes). El barrido que envía los recordatorios corre cada 5 minutos dentro del propio backend.
- **Notas**: individuales o compartidas con el resto de las cuentas de la instalación.
- **Biblioteca de modelos**: guarda una escritura propia (.doc/.docx) para reutilizarla como modelo en futuras sesiones sin volver a subir el archivo; aparece como opción alternativa a "Adjuntar modelo" en el configurador.

**Importante:** a diferencia del pipeline de IA y del índice de protocolo, estas tres tablas se guardan **sin cifrar** (ver `docs/PRIVACIDAD.md`, sección "Excepción sin cifrar"). Es una decisión deliberada para poder buscar y filtrar, pero implica que un dump de la base expone el título de los turnos, el contenido de las notas y el texto completo de los modelos guardados.

### 3.8 Clientes, expedientes y presupuestos

- **Clientes**: buscador por nombre, alta/edición, detalle con historial. El nombre, el tipo y las observaciones se guardan en texto plano; DNI, CUIT, domicilio, teléfono, correo, estado civil y nacionalidad se guardan **cifrados** (AES-256-GCM, contexto `"cliente"`). Ver `docs/PRIVACIDAD.md`, "Excepción mixta".
- **Expedientes**: una carpeta por operación con partes (clientes + rol), tareas (pendientes/hechas), presupuestos y el vínculo con la ejecución del pipeline y con la entrada del protocolo. Desde el resultado de un análisis, **"Guardar en un expediente"** crea o elige un expediente, opcionalmente crea clientes a partir de los comparecientes y convierte el **checklist previo a la firma** (más los requisitos previos del estudio de títulos) en tareas.
- **Presupuestos**: conceptos y montos en ARS o USD, número correlativo por cuenta, validez, notas; se descargan en **PDF** (`pdfkit`) y se comparten por WhatsApp con un enlace `wa.me` que lleva el resumen (el PDF se adjunta desde el chat).

### 3.9 Caja, comprobantes, factura electrónica y UIF

- **Caja** (cuenta corriente por cliente): los **cargos** nacen solos al pasar un presupuesto a "aceptado" y al emitir un comprobante (el cargo del presupuesto se reemplaza por el del comprobante, sin duplicar); también se cargan a mano. Los **pagos** se registran a mano (efectivo, transferencia, Mercado Pago, cheque, otro) con referencia. Resumen por período (pendiente de cobro, cobrado, cargado) por moneda y exportación a **CSV** (separador `;`, listo para Excel es-AR). Un cargo automático no se borra: se cambia el estado del presupuesto o se anula el comprobante.
- **Comprobantes**: **recibo** y **nota de honorarios** son comprobantes internos ("documento no válido como factura"), numerados por tipo y punto de venta (`00001-00000001`), con PDF, anulación con motivo y CSV para el contador. El receptor se guarda como snapshot cifrado, así el comprobante se reimprime igual aunque el cliente se borre. Desde un presupuesto aceptado, "facturar" prellena cliente, expediente y conceptos.
- **Factura electrónica (ARCA)**: viene **apagada**. Para habilitarla, en Comprobantes → "Datos fiscales": (1) cargar CUIT, razón social, domicilio, condición frente al IVA y punto de venta; (2) generar en ARCA un certificado para el servicio `wsfe` (primero en **homologación** vía WSASS: crear el CSR con `openssl req -new -key clave.key -subj "/C=AR/O=<razón social>/CN=doyfe/serialNumber=CUIT <cuit>" -out pedido.csr`, subirlo en WSASS, descargar el `.crt` y autorizar el servicio `wsfe` para ese certificado); (3) subir el `.crt` y la `.key` (se cifran y no se vuelven a mostrar), elegir entorno "homologación", guardar y **"Probar conexión con ARCA"** (WSAA + `FEDummy`); (4) emitir una factura de prueba; (5) repetir con el certificado de producción en el portal de ARCA (Administrador de Relaciones → WSFE) y pasar el entorno a "producción". Con ARCA encendido aparecen Factura A/B (emisor responsable inscripto) o Factura C (monotributo/exento); el PDF lleva CAE, vencimiento y el **código QR obligatorio** (RG 4892/2020). En Facturas A/B los importes se cargan **sin IVA** y cada concepto lleva su tratamiento (21 %, 10,5 %, 27 %, exento, no gravado); el PDF discrimina neto, IVA y no gravado. En dólares, si no se indica cotización se usa la oficial de ARCA (`FEParamGetCotizacion`). Homologación y producción numeran por separado y las facturas de homologación salen marcadas "sin valor fiscal". La anulación fiscal de una factura con CAE requiere nota de crédito (fuera de alcance): la app solo la marca anulada y quita el cargo. Errores típicos de la puesta en marcha: `Computador no autorizado a acceder al servicio` = el DN del certificado (`CN=…`) no coincide exactamente con el DN autorizado para `wsfe` en WSASS; `punto de venta inexistente` = hay que darlo de alta en ARCA como "Factura Electrónica – Web Services". Probado en homologación el 12/09/2026: Factura C, Factura B con IVA mixto y Factura B en USD, las tres con CAE.
- **UIF** (Ley 25.246, Res. UIF 242/2023): **legajo** por cliente (riesgo, diligencia, PEP, actividad, origen de fondos, beneficiarios finales para sociedades, documentación presentada; los datos sensibles van cifrados; próxima revisión calculada: reforzada 1 año, media 3, simplificada 5), **ficha por expediente** (actividad específica alcanzada, monto y umbral en SMVM, **recaudos generados con IA** a partir de datos anonimizados —editables, con estado pendiente/hecho/no aplica— o cargados a mano) y **registro de eventos** (reporte sistemático mensual y anual, ROS, autoevaluación, revisión externa, capacitación). La pantalla UIF abre con las **alertas**: recaudos pendientes, legajos vencidos o faltantes en expedientes alcanzados, reporte mensual del mes anterior sin registrar, reporte anual (enero–marzo) y autoevaluación bienal. Los parámetros **SMVM vigente** y **umbral en SMVM** se cargan en Configuración (admin). Todo es **orientativo**: la escribanía lo contrasta con la resolución vigente y su manual de procedimientos; la app no envía nada a la UIF.

---

## 5. Configuración

Variables en `backend/.env` (ver `.env.example`):

| Variable | Descripción |
|---|---|
| `ANTHROPIC_API_KEY` | Clave de la API de Claude. Obligatoria. |
| `CLAUDE_MODEL` | Modelo por defecto (`claude-opus-5`). Cada skill puede definir el suyo en la tabla `skills`. |
| `CLAUDE_FALLBACKS` | `1` activa el reintento automático en otro modelo si el modelo declina un pedido por seguridad. |
| `SESSION_TTL_MINUTES` | Minutos de inactividad hasta destruir la sesión en memoria (30). |
| `SESIONES_GUARDADAS_TTL_DIAS` | Días hasta que una sesión guardada explícitamente ("Guardar y continuar después") vence y se borra sola (7). |
| `MAX_FILE_MB` | Tamaño máximo del archivo (15). |
| `DB_*` | Conexión MySQL. |

Los **prompts, modelo, esfuerzo y `max_tokens` de cada skill** se editan en la tabla `skills` (o vía `PUT /api/skills/:clave`). Las **plantillas** en la tabla `plantillas`; el redactor elige por `tipo_acto` y cae en `acto_generico` si no hay una específica.

---

## 6. API del backend

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/sesiones` | multipart: `archivo` (opcional si hay `antecedentes`), `antecedentes` (texto, opcional), `modelo` (archivo, opcional) o `modeloBibliotecaId` (id de un modelo ya guardado, alternativo a `modelo`), `modo` (`escritura` / `estudio_titulos` / `completo` / `certificacion_firmas`), `instrucciones` (texto), `datos` (JSON, solo certificación). Requiere al menos un archivo o antecedentes escritos (o un firmante, en certificación). Devuelve `sesionId` y lanza el pipeline. |
| `GET` | `/api/sesiones/:id` | Estado y resultados (anonimizados), incluido `numeroIteracion`. |
| `GET` | `/api/sesiones/:id/eventos` | Server-Sent Events con el progreso de cada skill. |
| `GET` | `/api/sesiones/:id/documento` | Descarga el `.docx` final y **destruye la sesión**. |
| `POST` | `/api/sesiones/:id/reintentar` | Reanuda una sesión fallida desde la etapa que falló, con el proveedor de IA actual. |
| `POST` | `/api/sesiones/:id/iterar` | `{ feedback }`. Genera una nueva versión de un resultado ya completado, incorporando el pedido. |
| `DELETE` | `/api/sesiones/:id` | Cierra la sesión y borra los datos en memoria. |
| `POST` | `/api/sesiones/:id/guardar` | Cifra y persiste la sesión (completada o fallida; no "en_curso") para reanudarla después, y libera la memoria. |
| `GET` | `/api/sesiones-guardadas` | Lista las sesiones guardadas de la cuenta (sin descifrar nada: modo, estado, fechas). |
| `POST` | `/api/sesiones-guardadas/:id/reanudar` | Descifra, reconstruye la sesión en memoria (nuevo id) y borra el guardado (uso único). |
| `DELETE` | `/api/sesiones-guardadas/:id` | Descarta una sesión guardada antes de que venza. |
| `GET` | `/api/protocolo?anio=` | Lista las entradas del índice de protocolo del año (comparecientes descifrados server-side). |
| `GET` | `/api/protocolo/anios`, `/api/protocolo/sugerido?anio=` | Años con entradas; próximo número de orden y folio sugeridos. |
| `GET` | `/api/protocolo/desde-sesion/:sesionId` | Nombres reales de una sesión viva (antes de descargarla), para prellenar el registro en el protocolo. |
| `POST` | `/api/protocolo` | Crea una entrada (registrar una escritura/acta firmada e impresa). |
| `PUT/PATCH/DELETE` | `/api/protocolo/:id`, `/:id/estado` | Editar folios/comparecientes/observaciones, cambiar estado (vigente/revocada/anulada), o borrar solo la última entrada del año. |
| `GET` | `/api/protocolo/:anio/exportar` | Descarga el índice anual en `.docx`, listo para imprimir. |
| `GET` | `/api/turnos?desde=&hasta=` | Turnos de la cuenta en el rango de fechas (para pintar la agenda). |
| `POST/PUT` | `/api/turnos`, `/api/turnos/:id` | Crear o editar un turno. |
| `PATCH` | `/api/turnos/:id/estado` | Cambiar estado (`pendiente`/`confirmado`/`cancelado`/`realizado`). |
| `DELETE` | `/api/turnos/:id` | Borrar un turno. |
| `GET/POST` | `/api/notas` | Listar (propias + compartidas de la instalación) o crear una nota. |
| `PUT/DELETE` | `/api/notas/:id` | Editar o borrar una nota propia. |
| `GET` | `/api/biblioteca-modelos` | Listar los modelos guardados de la cuenta (sin el contenido). |
| `POST` | `/api/biblioteca-modelos` | multipart: `archivo` (.doc/.docx), `nombre`, `tipoActo` opcional. Guarda el texto extraído. |
| `DELETE` | `/api/biblioteca-modelos/:id` | Borrar un modelo guardado. |
| `GET/POST` | `/api/clientes?q=`, `/api/clientes` | Buscar por nombre / crear cliente. Los identificadores (DNI, CUIT, domicilio, teléfono, correo) se guardan cifrados. |
| `GET/PUT/DELETE` | `/api/clientes/:id` | Detalle con historial (expedientes y presupuestos), editar, borrar. |
| `GET/POST` | `/api/expedientes?estado=`, `/api/expedientes` | Listar (con partes y tareas pendientes) / crear expediente. |
| `GET/PUT/PATCH/DELETE` | `/api/expedientes/:id`, `/:id/estado` | Detalle (partes, tareas, presupuestos, ejecución y protocolo vinculados), editar, cambiar estado, borrar. |
| `PUT` | `/api/expedientes/:id/partes` | Reemplaza la lista de partes `[{clienteId, rol}]`. |
| `POST/PUT/PATCH/DELETE` | `/api/expedientes/:id/tareas`, `/:tareaId`, `/:tareaId/estado` | Tareas del expediente. |
| `POST` | `/api/expedientes/:id/tareas/desde-sesion/:sesionId` | Crea tareas desde el checklist previo a la firma y los requisitos previos de una sesión viva, y vincula la ejecución. |
| `GET/POST` | `/api/presupuestos?expedienteId=|clienteId=`, `/api/presupuestos` | Listar / crear (número correlativo por cuenta, total calculado en el servidor). |
| `PUT/PATCH/DELETE` | `/api/presupuestos/:id`, `/:id/estado` | Editar, cambiar estado, borrar. |
| `GET` | `/api/presupuestos/:id/pdf` | Descarga el presupuesto en PDF. |
| `GET` | `/api/movimientos?clienteId=&desde=&hasta=`, `/resumen`, `/saldo/:clienteId`, `/csv` | Cuenta corriente: movimientos, resumen por moneda (cargado, cobrado, pendiente), saldo de un cliente, CSV. |
| `POST/DELETE` | `/api/movimientos/pagos`, `/api/movimientos/cargos`, `/api/movimientos/:id` | Registrar un pago o un cargo manual; borrar solo movimientos manuales. |
| `GET/POST` | `/api/comprobantes?desde=&hasta=&expedienteId=`, `/api/comprobantes` | Listar / emitir (recibo, nota de honorarios; factura A/B/C si ARCA está activo). `presupuestoId` prellena. |
| `GET/POST` | `/api/comprobantes/:id`, `/:id/pdf`, `/:id/anular`, `/api/comprobantes/csv` | Detalle, PDF, anular con motivo, CSV para el contador. |
| `GET/PUT/DELETE/POST` | `/api/configuracion-fiscal`, `/credenciales`, `/probar` | Datos fiscales del emisor y credenciales ARCA (cifradas, nunca devueltas); probar WSAA + FEDummy. |
| `GET` | `/api/uif/alertas`, `/api/uif/expedientes` | Alertas de cumplimiento; expedientes con actividad UIF. |
| `GET/PUT` | `/api/uif/parametros` | SMVM vigente y umbral en SMVM (PUT solo admin). |
| `GET/PUT` | `/api/uif/legajos/:clienteId` | Legajo KYC del cliente (datos sensibles cifrados). |
| `GET/PUT/POST` | `/api/uif/expedientes/:id`, `/:id/generar` | Ficha UIF del expediente (actividad, monto, recaudos, estado); generar recaudos con IA (entrada anonimizada, costo registrado en Consumo). |
| `GET/POST/DELETE` | `/api/uif/eventos`, `/api/uif/eventos/:id` | Reportes y eventos de cumplimiento. |
| `GET/PUT` | `/api/skills`, `/api/skills/:clave` | Configuración de skills. |
| `GET` | `/api/plantillas`, `/api/plantillas/:clave` | Plantillas. |
| `GET` | `/api/salud` | Estado del servidor y proveedor de IA activo. |
| `POST` | `/api/auth/registro`, `/login`, `/logout`, `/recuperar`, `/restablecer`, `/cambiar-password` | Cuentas. `GET /api/auth/yo` devuelve la sesión actual. Todas las rutas de sesiones y configuración exigen sesión. |
| `GET/PUT` | `/api/configuracion/ia` | Proveedor, modelo y clave (cifrada; la respuesta solo trae la clave enmascarada). |
| `POST` | `/api/configuracion/ia/probar` | Prueba la conexión con Claude o con el servidor local sin consumir tokens. |
| `GET/PUT/DELETE` | `/api/configuracion/precios` | Precio USD por millón de tokens de cada proveedor/modelo, editable desde la app. |
| `GET` | `/api/consumo?dias=30` | Totales, serie diaria y desglose por modelo del costo estimado y los tokens usados (propio, o de todas las cuentas si es admin). |
| `GET/PUT` | `/api/configuracion/planes`, `/api/configuracion/planes/facturacion` | ABM de planes y parámetros del fee por uso (cargo fijo, margen, tipo de cambio, si se exige suscripción). Solo admin. |
| `GET` | `/api/suscripcion/planes` | Planes activos, para elegir uno. Cualquier cuenta. |
| `GET/POST` | `/api/suscripcion`, `/api/suscripcion/cancelar` | Estado de la propia suscripción, cargos de uso pendientes; crear o cancelar la suscripción en Mercado Pago. |
| `POST` | `/api/webhooks/mercadopago` | Notificaciones de Mercado Pago (pública; se autentica con la firma HMAC, no con cookie). |

---

## 7. Problemas frecuentes

- **"No se pudo conectar a MySQL"**: MySQL no está corriendo o `DB_*` en `.env` es incorrecto. Probar `npm run db:init`.
- **"Falta la clave de Claude"** en la cabecera: completar `ANTHROPIC_API_KEY` en `backend/.env` y reiniciar el backend.
- **"La sesión no existe o ya fue cerrada"**: se descargó el documento o pasaron más de `SESSION_TTL_MINUTES`. Volver a cargar el archivo.
- **Archivo `.doc` ilegible**: algunos `.doc` muy antiguos o protegidos no se pueden leer; guardarlo como `.docx` desde Word.
- **Salida truncada**: subir `max_tokens` del skill en la tabla `skills`.
- **"No se pudo conectar con api.anthropic.com" desde Docker, pero el navegador sí llega**: la red tiene un proxy de seguridad que reemplaza los certificados TLS y el contenedor no confía en su autoridad. Exportar la CA del proxy en formato PEM y guardarla como `certs/ca.pem`; el backend la carga al arrancar (`docker compose up -d backend`).
# n2026

## 8. Costo de cada operación y registro de consumo

Cada llamada a un skill (extractor, analista, redactor, validador, certificación) queda registrada con su proveedor, modelo, tokens de entrada y salida, y **costo estimado en USD**, sin ningún dato del documento. Esto se ve en dos lugares:

- **En el momento**: junto a cada etapa del pipeline, en la columna de "Etapas del análisis" (por ejemplo `Listo · 4 s · US$ 0.0041`). Al terminar, el chat suma el costo total de la sesión.
- **Con el tiempo**: pantalla **Consumo** (botón junto a "Configuración"), con el total del período elegido, el desglose por modelo y las últimas ejecuciones. Los datos salen de las tablas `ejecuciones` y `ejecuciones_skills`, que ya existían para auditoría y ahora también guardan el costo.

El costo se calcula con una tabla de precios editable (`Consumo → Precios por modelo`, o `GET/PUT/DELETE /api/configuracion/precios`): USD por millón de tokens de entrada, salida y lectura de caché, por proveedor y modelo. Viene precargada con:

- **Claude**: los precios publicados por Anthropic (`claude-opus-5` US$ 5 / US$ 25 por millón, `claude-sonnet-5` US$ 2 / US$ 10, `claude-haiku-4-5` US$ 1 / US$ 5).
- **Gemini**: precios de referencia marcados como **aproximados**, porque Google los cambia con frecuencia y publica modelos "preview" nuevos cada pocos meses (ya pasó una vez en este proyecto: `gemini-2.5-pro` se retiró para cuentas nuevas). Si el costo mostrado no coincide con la facturación real de Google, corríjalo ahí mismo; la pantalla enlaza a [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing).
- **IA local y modo simulado**: siempre US$ 0 (corren en la propia máquina o son de prueba).

Si un modelo no tiene precio cargado, el costo de esa operación se muestra como **N/D** en vez de inventar un número, y el total del período se marca como parcial hasta que se cargue el precio.

**Nota sobre precisión**: el costo de la caché de prompt de Claude distingue lectura de caché (más barata) del resto, pero no separa la escritura de caché (que Anthropic factura ~1.25× el precio de entrada) de los tokens frescos; en sesiones con mucha escritura de caché el costo real puede ser algo mayor al estimado. Para Gemini, el cálculo usa los mismos campos que reporta la API de Google (`promptTokenCount`, `candidatesTokenCount`, `cachedContentTokenCount`).

## 9. Despliegue en internet: Vercel + backend persistente

### 9.1 Por qué el backend no va a Vercel

Vercel ejecuta el código en funciones serverless: cada pedido puede caer en una instancia distinta, la memoria no se conserva entre pedidos y hay un límite de duración por función. El backend de Doy Fe depende justamente de lo contrario: los datos reales de los clientes viven **solo en memoria** durante la sesión, el pipeline tarda varios minutos y el progreso viaja por una conexión abierta. Llevarlo a Vercel obligaría a guardar el mapa de datos reales en un almacén externo, lo que rompe la regla de privacidad.

Por eso el despliegue recomendado es:

| Pieza | Dónde | Motivo |
|---|---|---|
| Frontend (React) | **Vercel** | Estático, gratis, HTTPS automático |
| Backend (Express) + MySQL | **Servidor persistente**: la Mac mini de la escribanía (recomendado) o un servicio como Railway / Render / Fly.io | Memoria estable, procesos largos, y en la Mac mini además correrá la IA local |

Con la Mac mini, cuando pases a IA local, **ningún dato sale de la oficina**: el frontend en Vercel solo sirve la interfaz; todo el procesamiento ocurre en la máquina de la escribanía.

### 9.2 Frontend en Vercel: qué poner en cada campo

En vercel.com → **Add New… → Project** → importar el repositorio (subilo antes a GitHub/GitLab/Bitbucket). En la pantalla de configuración:

| Campo | Valor |
|---|---|
| **Framework Preset** ("application preset") | **Vite** |
| **Root Directory** | `frontend` (clic en Edit y elegir la carpeta) |
| **Build Command** | `npm run build` (queda por defecto) |
| **Output Directory** | `dist` (queda por defecto) |
| **Install Command** | `npm install` |
| **Node.js Version** (Settings → General) | 20.x |
| **Environment Variables** | Ninguna es necesaria: el frontend habla con el backend por la ruta `/api` |

Antes de desplegar, editá [frontend/vercel.json](frontend/vercel.json) y reemplazá `https://REEMPLAZAR-POR-TU-BACKEND.example.com` por la URL pública HTTPS de tu backend. Ese archivo hace que Vercel reenvíe `/api/*` al backend: el navegador ve un solo origen, así la cookie de sesión funciona sin configuración extra. Si el proxy de Vercel no mantiene abierta la conexión de progreso (SSE), la interfaz pasa sola a consultar el estado cada tres segundos.

Deploy → Vercel te da una URL `https://notarius-xxx.vercel.app`. Esa URL es la que va en `FRONTEND_ORIGIN` y `APP_URL` del backend.

### 9.3 Backend en la Mac mini (recomendado)

1. Instalar Docker Desktop y clonar el repositorio.
2. Crear `.env` en la raíz a partir de `.env.example` y completar:

```bash
ANTHROPIC_API_KEY=sk-ant-...          # clave de console.anthropic.com (ver 8.6)
JWT_SECRET=$(openssl rand -hex 32)    # pegar el valor generado
COOKIE_SECURE=1
APP_URL=https://notarius-xxx.vercel.app
FRONTEND_PORT_HOST=8080
CODIGO_REGISTRO=un-codigo-que-solo-conozcas-vos
SMTP_HOST=... SMTP_USER=... SMTP_PASS=... SMTP_FROM=...   # para el correo de recuperación (opcional)
```

3. `docker compose up -d --build`.
4. Exponer el backend con HTTPS sin abrir puertos del router: **Cloudflare Tunnel** (gratis). Instalar `cloudflared`, `cloudflared tunnel login`, crear un túnel que apunte a `http://localhost:3001` y asignarle un subdominio (`api.tu-dominio.com`). Esa es la URL que va en `vercel.json`. Alternativa sin dominio propio: `cloudflared tunnel --url http://localhost:3001` da una URL temporal `*.trycloudflare.com`, útil para probar.
5. En `FRONTEND_ORIGIN` del backend poner la URL de Vercel (en `docker-compose.yml` se arma a partir de `FRONTEND_PORT_HOST`; para producción definí `FRONTEND_ORIGIN` explícitamente en `.env` y agregalo al `environment` del servicio, o dejá el proxy de Vercel, que hace que el origen visto por el backend sea el mismo).

### 9.4 Backend en Railway / Render (alternativa sin Mac mini)

- Railway: New Project → Deploy from GitHub → Root Directory `backend` (usa el `Dockerfile`). Agregar el plugin **MySQL** y ejecutar `database/01_schema.sql`, `02_seed.sql` y `03_auth.sql` una vez (Railway → MySQL → Data / o `npm run db:init` con las variables `DB_*` apuntando a la instancia). Variables: las mismas de 8.3 más `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `TRUST_PROXY=1`, `PORT=3001`.
- La URL pública que te da Railway es la que va en `vercel.json`.

### 9.5 Cuentas: registro, ingreso, recuperación

- La **primera cuenta** se crea libremente desde "Crear cuenta" y queda como **administradora** automáticamente. Las siguientes requieren el `CODIGO_REGISTRO` del `.env` (o `REGISTRO_ABIERTO=1`) y son cuentas normales. Así la app publicada en internet no acepta registros de desconocidos.
- Las contraseñas se guardan con scrypt (nunca en claro). La sesión es una cookie `httpOnly` firmada, válida `SESSION_HOURS` horas; "Salir" la elimina.
- **Olvidé mi contraseña** envía un enlace válido 30 minutos. Necesita SMTP (Gmail con contraseña de aplicación, Brevo, Resend por SMTP, etc.). Sin SMTP, el enlace se imprime en el log del backend (`docker compose logs backend`), útil en local.
- Tras cinco intentos fallidos de ingreso, el correo queda bloqueado 15 minutos.

**Varias escribanas y escribanos en la misma instalación.** Cada cuenta solo ve y puede operar sus propias sesiones de trabajo: pedir la de otra cuenta por su identificador responde "no existe", igual que si de verdad no existiera. Solo la cuenta **administradora** puede configurar el proveedor de IA, los precios y ver el consumo de todas las cuentas (con un desglose por cuenta); una cuenta normal solo ve su propio consumo en la pantalla **Consumo**, sin acceso a **Configuración**. El rol se guarda en `usuarios.es_admin` y se revisa contra la base en cada pedido a una ruta administrativa, no en la cookie de sesión, así que degradar a una cuenta surte efecto de inmediato.

### 9.6 Claude hoy: qué clave usar y dónde cargarla

La clave se carga **desde la propia aplicación**: menú **Configuración** (arriba a la derecha, o clic en el indicador "Sin IA configurada"). Ahí se elige el proveedor (Claude, IA local o simulado), se pega la clave, se elige el modelo y se pulsa **Probar conexión** (no consume tokens: solo consulta el modelo) y **Guardar**. La clave se guarda cifrada con AES-256-GCM en la tabla `configuracion`, derivando la llave de `JWT_SECRET`; por eso `JWT_SECRET` debe ser estable: si cambia, la app avisa que la clave quedó ilegible y pide cargarla de nuevo. Nunca se muestra completa. Las variables de entorno (`ANTHROPIC_API_KEY`, `LLM_PROVIDER`, etc.) siguen funcionando como valores por defecto cuando no hay nada guardado desde la app.

La app llama a la API de Anthropic con el SDK oficial y necesita una clave `sk-ant-...` creada en **console.anthropic.com** (API Keys). Esa clave se factura por uso y es independiente de la suscripción Claude Pro, que cubre claude.ai y Claude Code pero no da acceso a la API. Los tokens de sesión de Claude Code no pueden usarse en aplicaciones propias. Con pocos dólares de crédito alcanza para probar; un caso completo con Opus 5 cuesta del orden de un dólar.

### 9.6 bis Google Gemini como alternativa

En Configuración → proveedor **Google Gemini**: pegar una clave de [aistudio.google.com](https://aistudio.google.com/apikey), elegir el modelo con el botón "Ver modelos disponibles" (Google retira modelos con frecuencia; el listado sale de su API con tu clave), probar y guardar.

**Reintento y cambio automático de modelo.** Si el modelo elegido responde "alta demanda" o un error transitorio, el backend reintenta 3 veces (con esperas de 3, 8 y 20 segundos) y, si sigue sin responder, prueba solo hasta dos modelos "flash" del plan gratuito automáticamente, sin perder el documento ni las instrucciones. El chat muestra cada paso ("Modelo … no disponible; probando con …"). Este cambio automático no ocurre si el error es de cuenta (clave inválida, sin permiso) o si el modelo rechazó el contenido: ahí hay que usar el botón **Reintentar** después de revisar la clave o el modelo en Configuración. Usa la misma anonimización, los mismos prompts y esquemas de salida. Advertencia: en el **plan gratuito** de la API de Gemini, Google puede usar los datos enviados para mejorar sus modelos; aunque viajan anonimizados, para trabajo real conviene el plan pago (facturación activada en Google Cloud), donde no se usan para entrenamiento.

### 9.7 IA local en la Mac mini M4 Pro (32 GB)

1. Instalar [Ollama](https://ollama.com) (o LM Studio) y descargar un modelo. Con 32 GB de RAM unificada, opciones razonables:

| Modelo | Tamaño en memoria | Comentario |
|---|---|---|
| `qwen3:32b` | ~20 GB (Q4) | Mejor razonamiento en castellano jurídico; lento en salidas largas |
| `gemma3:27b` | ~17 GB | Buen equilibrio |
| `qwen3:14b` | ~9 GB | Rápido; menor calidad |

```bash
ollama pull qwen3:32b
```

2. En `.env`: `LLM_PROVIDER=local`, `LOCAL_LLM_BASE_URL=http://host.docker.internal:11434/v1`, `LOCAL_LLM_MODEL=qwen3:32b`. Reiniciar: `docker compose up -d backend`. La cabecera de la app mostrará "IA local · qwen3:32b".
3. El backend habla con Ollama por la API compatible con OpenAI y pide salida JSON con el mismo esquema que a Claude. Los prompts y plantillas no cambian.

Advertencia honesta: un modelo local de 30B parámetros es sensiblemente inferior a Claude Opus 5 en criterio jurídico y en redacción notarial. Medilo con los evaluadores de la sección 3 (`evalCaso.js`, `evalConsultas.js`) antes de confiar en él, y esperá tiempos de varios minutos por skill.

---

## 10. Muchos usuarios, suscripción y cobro por uso (Mercado Pago, ARS)

Doy Fe soporta varias cuentas independientes (ver sección 9.5: rol de administradora, aislamiento de sesiones). Esta sección agrega, sobre esa base, cobrar una **suscripción mensual** más un **fee por documento procesado**, con **Mercado Pago** en pesos argentinos.

### 10.1 Cómo se cobra

- **Suscripción mensual**: cada cuenta elige un plan (ABM en Configuración → Planes y facturación de uso, solo administradora) y Mercado Pago la debita automáticamente cada mes. Se implementa con una **suscripción sin tarjeta guardada en el backend**: al elegir un plan, la app pide a Mercado Pago una suscripción y redirige a la escribana o al escribano a un checkout alojado por ellos (`init_point`) donde autoriza el débito. El servidor nunca ve ni guarda un número de tarjeta.
- **Fee por uso**: por cada documento procesado se calcula `cargo fijo (ARS) + costo real de la IA (convertido de USD a ARS) × (1 + margen)`, usando la misma medición de costo por operación de la sección 8. Los tres parámetros (cargo fijo, margen, tipo de cambio) se cargan en Configuración → Planes y facturación de uso.
- **Mercado Pago no tiene un cargo "por evento" nativo sobre una suscripción activa.** Por eso el fee por uso de un mes se acumula en la tabla `cargos_uso` y se **vuelca al monto del próximo ciclo** de la suscripción (cuota del plan + uso acumulado). Esto lo hace `cerrarCicloDeCuenta()` en `backend/src/services/facturacion.js`; en esta versión se dispara a mano (por ejemplo desde un script o una futura pantalla de "cerrar el mes"), no hay todavía un cron automático. Para automatizarlo, llamar a esa función una vez por cuenta al inicio de cada ciclo (por ejemplo con un cron del sistema operativo o un scheduler dentro de la app).
- **Cada documento se cobra una sola vez** aunque la escribana o el escribano pida varias mejoras (iteraciones) sobre el mismo: el cargo tiene una fila fija por `ejecucion_id` y las iteraciones solo actualizan el costo de IA de esa fila, no agregan un cargo nuevo.

### 10.2 Poner en marcha Mercado Pago

1. Crear una cuenta de Mercado Pago (o usar la existente de la escribanía) y entrar a [mercadopago.com.ar/developers/panel](https://www.mercadopago.com.ar/developers/panel) → "Tus integraciones" → crear una aplicación.
2. Copiar el **Access Token** (usar el de prueba primero) a `MP_ACCESS_TOKEN` en `.env`.
3. En la misma aplicación, "Webhooks" → "Configurar notificaciones": cargar la URL pública `https://tu-backend/api/webhooks/mercadopago`, elegir el evento **Suscripciones** (`subscription_preapproval`), guardar y copiar el **secreto de la firma** a `MP_WEBHOOK_SECRET`.
4. `docker compose up -d backend`.
5. Como administradora, crear al menos un plan en Configuración → Planes y facturación de uso, y cargar el fee fijo, el margen y el tipo de cambio USD→ARS (manual: hay que actualizarlo cada tanto, Doy Fe no lo busca solo).
6. Probar con una cuenta normal: pantalla **Suscripción** → elegir un plan → Mercado Pago redirige al checkout de prueba → autorizar con una [tarjeta de prueba](https://www.mercadopago.com.ar/developers/es/docs/checkout-api/additional-content/test-cards) → vuelve a `/suscripcion` en la app. El webhook actualiza el estado a "activa" en cuanto Mercado Pago confirma la autorización.
7. Para **exigir** suscripción activa para procesar documentos nuevos, activar "Exigir suscripción activa" en los parámetros de facturación. Por defecto está apagado, para no bloquear instalaciones de una sola escribana o escribano que no van a cobrar nada. La cuenta administradora nunca queda bloqueada.
8. Pasar `MP_ACCESS_TOKEN` a un token de **producción** (mismo panel) cuando se vaya a cobrar de verdad.

### 10.3 Qué falta para un v1 realmente terminado

Esto deja la integración funcionando y probada (creación de suscripción, checkout alojado sin tocar tarjetas, validación real de la firma de los webhooks, cálculo y acumulación del fee por uso), pero un negocio de cobro real todavía necesita, antes de facturar a desconocidos:

- Automatizar `cerrarCicloDeCuenta()` con un cron (hoy es manual).
- Probar el flujo completo con una cuenta de Mercado Pago real de prueba (yo no pude: hace falta una cuenta y una tarjeta de prueba, algo que solo puede hacer quien la va a operar).
- Una pantalla de recibos/comprobantes para la escribana o el escribano, y manejo de pagos rechazados (Mercado Pago reintenta solo, pero conviene avisar en la app).
- Términos de servicio y política de privacidad publicados, acordes a las obligaciones de una escribana o un escribano con esta app (retención de datos, subprocesadores como Anthropic/Google/Mercado Pago).

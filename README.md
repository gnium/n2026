# Notarius 2026

Aplicación web monousuario para una escribana. Se arrastra un archivo `.doc`/`.docx` con borradores o antecedentes, el sistema lo procesa con la API de Claude a través de cuatro *skills* encadenados y devuelve una minuta de escritura en `.docx` con anexos de estudio de títulos y control fiscal/registral.

**Regla central de privacidad:** los datos de las partes (nombres, DNI, CUIT, domicilios, datos catastrales) nunca se guardan en la base de datos ni en disco. Viven solo en la memoria del servidor, dentro de una sesión que se destruye al descargar el documento, al cerrarla o por inactividad. Ver [docs/PRIVACIDAD.md](docs/PRIVACIDAD.md).

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
│   └── 02_seed.sql            # prompts de los 4 skills + 3 plantillas notariales
├── backend/
│   ├── src/server.js          # Express, CORS, helmet, rutas
│   ├── src/config/            # env.js, db.js (pool mysql2)
│   ├── src/routes/            # sesiones.js (subida, SSE, descarga, cierre), configuracion.js (skills, plantillas)
│   ├── src/middleware/        # upload.js (multer en memoria), errorHandler.js
│   ├── src/services/
│   │   ├── documentParser.js  # .docx (mammoth) y .doc (word-extractor)
│   │   ├── anonymizer.js      # fases A (regex), B (entidades del extractor) y C (rehidratación)
│   │   ├── sessionStore.js    # sesiones en memoria con TTL y destrucción
│   │   ├── claudeClient.js    # SDK @anthropic-ai/sdk: streaming, salida estructurada, fallbacks
│   │   ├── claudeMock.js      # modo simulado (sin clave de API)
│   │   ├── pipeline.js        # orquestación de los 4 skills
│   │   ├── docxBuilder.js     # genera el .docx final (librería docx)
│   │   └── auditoria.js       # escritura en MySQL, solo metadatos
│   ├── src/skills/            # schemas.js (Zod), repositorio.js (lectura de MySQL)
│   ├── scripts/initDb.js      # crea BD + seed sin necesitar el cliente mysql
│   └── scripts/smokeTest.js   # prueba local sin red ni BD
├── frontend/
│   ├── src/                   # App.jsx, api.js, components/{DropZone,Pipeline,ChatLog,ResultPanel}.jsx
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

Opción B (con cliente `mysql`):

```bash
mysql -u root -p < database/01_schema.sql
mysql -u root -p < database/02_seed.sql
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

1. Arrastrar el **documento base** (`.doc`/`.docx`: borrador, antecedentes, título) a la zona punteada.
2. Elegir qué generar: **Redactar la escritura**, **Estudio de títulos** o **Análisis completo**. Opcionalmente escribir **instrucciones** libres (acto, precio, forma de pago, qué revisar) y adjuntar una **escritura modelo propia** para que la minuta siga su estructura y estilo en lugar de la plantilla estándar.
3. Seguir el avance en "Etapas del análisis" y en el chat. Puede tardar varios minutos.
4. Revisar las pestañas disponibles (vista previa anonimizada).
5. **Descargar .docx**. El archivo contiene los datos reales; la sesión se borra del servidor en ese momento.

Qué corre en cada modo:

| Modo | Skills | Salida |
|---|---|---|
| Redactar la escritura | extractor → redactor → validador fiscal/registral | Minuta + anexo de validación |
| Estudio de títulos | extractor → analista | Informe de tracto y riesgos |
| Análisis completo | los cuatro | Minuta + estudio + validación |

Las instrucciones y la escritura modelo pasan por la misma anonimización que el documento. Las marcas de la escritura modelo (`[[MODELO_...]]`, datos de otro cliente) nunca se rehidratan en el documento final.

### 3.6 Producción local (una sola URL)

```bash
cd frontend && npm run build          # genera frontend/dist
```

Servir `frontend/dist` con cualquier servidor estático (o agregar `app.use(express.static("../frontend/dist"))` en `backend/src/server.js`) y ajustar `FRONTEND_ORIGIN` en `.env`.

---

## 5. Configuración

Variables en `backend/.env` (ver `.env.example`):

| Variable | Descripción |
|---|---|
| `ANTHROPIC_API_KEY` | Clave de la API de Claude. Obligatoria. |
| `CLAUDE_MODEL` | Modelo por defecto (`claude-opus-5`). Cada skill puede definir el suyo en la tabla `skills`. |
| `CLAUDE_FALLBACKS` | `1` activa el reintento automático en otro modelo si el modelo declina un pedido por seguridad. |
| `SESSION_TTL_MINUTES` | Minutos de inactividad hasta destruir la sesión en memoria (30). |
| `MAX_FILE_MB` | Tamaño máximo del archivo (15). |
| `DB_*` | Conexión MySQL. |

Los **prompts, modelo, esfuerzo y `max_tokens` de cada skill** se editan en la tabla `skills` (o vía `PUT /api/skills/:clave`). Las **plantillas** en la tabla `plantillas`; el redactor elige por `tipo_acto` y cae en `acto_generico` si no hay una específica.

---

## 6. API del backend

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/sesiones` | multipart: `archivo` (obligatorio), `modelo` (opcional), `modo` (`escritura` / `estudio_titulos` / `completo`), `instrucciones` (texto). Devuelve `sesionId` y lanza el pipeline. |
| `GET` | `/api/sesiones/:id` | Estado y resultados (anonimizados). |
| `GET` | `/api/sesiones/:id/eventos` | Server-Sent Events con el progreso de cada skill. |
| `GET` | `/api/sesiones/:id/documento` | Descarga el `.docx` final y **destruye la sesión**. |
| `DELETE` | `/api/sesiones/:id` | Cierra la sesión y borra los datos en memoria. |
| `GET/PUT` | `/api/skills`, `/api/skills/:clave` | Configuración de skills. |
| `GET` | `/api/plantillas`, `/api/plantillas/:clave` | Plantillas. |
| `GET` | `/api/salud` | Estado del servidor. |

---

## 7. Problemas frecuentes

- **"No se pudo conectar a MySQL"**: MySQL no está corriendo o `DB_*` en `.env` es incorrecto. Probar `npm run db:init`.
- **"Falta la clave de Claude"** en la cabecera: completar `ANTHROPIC_API_KEY` en `backend/.env` y reiniciar el backend.
- **"La sesión no existe o ya fue cerrada"**: se descargó el documento o pasaron más de `SESSION_TTL_MINUTES`. Volver a cargar el archivo.
- **Archivo `.doc` ilegible**: algunos `.doc` muy antiguos o protegidos no se pueden leer; guardarlo como `.docx` desde Word.
- **Salida truncada**: subir `max_tokens` del skill en la tabla `skills`.
# n2026

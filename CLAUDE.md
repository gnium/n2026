# Doy Fe — Notas operativas

## Infraestructura

### DNS
- **Proveedor**: Hostmar (ns9.hostmar.com / ns10.hostmar.com)
- **Panel**: Ferozo cPanel en `http://138.219.43.153:2082/index.php`
- **Cuenta**: doyfe (doyfegestion.com)
- **Zona DNS**: se edita desde Dominios → Administración de Zonas DNS dentro del panel Ferozo. Después de agregar/editar un registro hay que hacer clic en "Confirmar Cambios" para que se aplique en el servidor.
- **Propagación**: los cambios DNS tardan entre 2 y 4 horas en hacerse efectivos en todos los servidores.

### Deploy
- **Plataforma**: Railway (auto-deploy on push to `main`)
- **Dockerfile**: imagen única que sirve backend + frontend compilado
- **Healthcheck**: `GET /api/health` → `{"ok": true}`
- **Dominio producción**: `app.doyfegestion.com` (CNAME → `zbp8drud.up.railway.app.`)
- **Dominio marketing**: `www.doyfegestion.com` (CNAME → `5si45mdz.up.railway.app.`)

### Google Cloud
- **Proyecto**: doyfe (ID: `doyfe-508504`)
- **Cuenta**: `sebastian@cumbre.tech` (authuser=1 en la consola)
- **OAuth consent screen**: publicado en producción
- **Scopes**: openid, email, calendar.events, drive.file

### Base de datos
- **Motor**: MySQL (servicio Railway, `mysql.railway.internal` desde los servicios, túnel SSH desde local)
- **Base**: `notarius`
- **Migraciones**: archivos en `database/NN_nombre.sql`. Para correr en producción:
  ```bash
  export PATH=/opt/homebrew/opt/mysql-client/bin:$PATH
  cat database/NN_nombre.sql | railway connect MySQL
  ```
- **Consultar producción**: `echo "USE notarius; SELECT ..." | railway connect MySQL`
- **Requisito local**: `brew install mysql-client` (el cliente, no el servidor)

## Convenciones del proyecto

- Backend: Express, ES modules, español en nombres de variables/funciones
- Frontend: React (Vite), sin TypeScript, CSS vanilla (variables CSS en :root)
- IDs ofuscados en URLs con Sqids
- Cifrado AES-256-GCM para datos sensibles (PII)
- Auth: JWT en cookie httpOnly + OTP por email

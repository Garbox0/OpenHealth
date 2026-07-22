# Baseline OWASP para OpenHealth Bridge

Estado al 21 de julio de 2026.

## Controles ya aplicados

### A01 Broken Access Control

- Tenant obligatorio por hostname o `X-OpenHealth-Tenant`.
- Queries filtradas por `tenant_id`.
- Roles separados: `admin`, `admission`, `medical_auditor`, `billing`, `support`, `doctor`, `patient`.
- El rol `doctor` puede derivar y documentar, pero no cambiar estados administrativos.

### A02 Cryptographic Failures

- Publicacion por HTTPS via Cloudflare Tunnel.
- `HSTS` en Caddy para hosts web.
- Secretos reales fuera del codigo en `.env.tunnel`.

### A03 Injection

- SQLAlchemy con parametros, sin SQL string armado por usuario.
- Pydantic valida entradas de API.

### A04 Insecure Design

- Modelo multi-tenant desde el core, no como filtro visual.
- Menor privilegio por rol.
- Datos de ART externos todavia no se integran: se deja preparado para recibirlos, sin scraping ni convenios falsos.

### A05 Security Misconfiguration

- CORS restringido a origins configurados.
- Metodos y headers CORS acotados.
- Headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.
- CSP en Caddy para la web.
- Swagger/OpenAPI bloqueable por Cloudflare salvo IP propia.

### A06 Vulnerable and Outdated Components

- Dependencias bloqueadas por `uv.lock`.
- Imagenes base versionadas en Docker Compose.

### A07 Identification and Authentication Failures

- Login OIDC con Keycloak.
- Frontend usa Authorization Code + PKCE.
- Tokens web guardados en `sessionStorage`, no persistidos en `localStorage`.
- `directAccessGrantsEnabled=false` para evitar password grant publico.
- Brute force protection activado en realm `openhealth`.

### A08 Software and Data Integrity Failures

- Deploy reproducible por Docker Compose.
- No se sobreescriben archivos cliente por cliente: el origen esta centralizado detras de tunnel.

### A09 Security Logging and Monitoring Failures

- Eventos de caso para trazabilidad clinica/operativa.
- Logs de Docker disponibles en Raspberry.

### A10 SSRF

- La API actual no consume URLs arbitrarias provistas por usuarios.
- Los documentos guardan referencias, no descargan contenido remoto.

## Pendientes antes de vender a clinicas reales

- Base separada o cluster Postgres administrado con backups probados.
- Auditoria de acceso de usuarios y eventos de login.
- MFA para admins y usuarios sensibles.
- Escaneo de dependencias en CI.
- Almacenamiento real de archivos con antivirus o validacion de contenido.
- Firma digital legal con proveedor/certificado, no solo firma simple de trazabilidad.
- Monitoreo externo de disponibilidad y alertas.

## Comandos operativos

Aplicar hardening vivo de Keycloak en Raspberry:

```bash
cd ~/openhealth-bridge/current
sh deploy/harden-keycloak.sh .env.tunnel
```

Ver headers publicos:

```bash
curl -I https://centralsalud.aerosftp.com/medicos/
curl -I https://api.aerosftp.com/health/live
```

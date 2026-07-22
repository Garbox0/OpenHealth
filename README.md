# OpenHealth Bridge

OpenHealth Bridge es una propuesta de software sanitario enfocada, en su primer corte, en la gestion de atenciones vinculadas a incidentes y ART.

La idea inicial no es construir todo un HIS ni tres productos separados. El primer objetivo es resolver un flujo concreto con un nucleo comun y una primera vista operativa:

1. registrar que una atencion corresponde a un incidente o caso ART;
2. pedir los datos administrativos minimos para ese circuito;
3. avisar al profesional que el caso requiere contexto adicional;
4. dejar trazabilidad del caso para auditoria, seguimiento y facturacion.

## Producto inicial

Primer caso de uso:

> Como recepcionista o integrador de una institucion, quiero marcar una atencion como incidente/ART y completar los datos minimos del caso, para que el medico, auditoria y facturacion trabajen sobre el mismo contexto.

## Estrategia de producto

Una sola plataforma, tres vistas futuras:

- backoffice ART y operacion;
- portal medico;
- portal paciente.

La primera en construirse sera el backoffice ART porque crea y sostiene el caso del que dependen las demas vistas.

Modelo comercial objetivo:

- una URL por clinica, por ejemplo `centralsalud.aerosftp.com`;
- login propio para los empleados de esa institucion;
- una sola sesion para moverse entre modulos segun rol.

## Alcance del MVP

- alta de casos ART/incidente;
- asociacion a paciente;
- asociacion a atencion;
- bandera visible para el equipo clinico;
- estados basicos del caso;
- auditoria minima;
- API backend simple.

## Fuera de alcance por ahora

- decisiones clinicas automatizadas;
- integraciones complejas con terceros;
- facturacion completa;
- motor de reglas;
- notificaciones multicanal;
- dashboards avanzados.

## Documentos

- [Producto MVP](docs/product-mvp.md)
- [Arquitectura de plataforma](docs/platform-architecture.md)
- [Arquitectura base](docs/architecture.md)
- [Uso de la API](docs/api-usage.md)
- [Runbook Cloudflare](docs/cloudflare-runbook.md)
- [Runbook Cloudflare Tunnel](docs/cloudflare-tunnel-runbook.md)
- [Reglas de seguridad Cloudflare](docs/cloudflare-security-rules.md)
- [Baseline OWASP](docs/owasp-security-baseline.md)
- [Branding por cliente](docs/tenant-branding.md)
- [Identidad visual](docs/brand-guidelines.md)
- [Retencion de datos clinicos](docs/clinical-data-retention.md)
- [Runbook Raspberry](docs/raspberry-access.md)
- [Alta de clinicas en Zero Trust](docs/tenant-onboarding.md)
- [Control de acceso](docs/access-control.md)
- [Preparacion multi-tenant](docs/multi-tenant-readiness.md)
- [AI handoff](docs/ai-handoff.md)
- [Estrategia de despliegue](docs/deployment-strategy.md)
- [Plan de implementacion](docs/implementation-plan.md)
- [Changelog](CHANGELOG.md)
- [Guia de trabajo](AGENTS.md)

## Enfoque

Vamos a construirlo en slices pequenos, validando primero si el flujo resuelve un dolor real antes de ampliar el alcance.

## Estado actual

La base actual incluye:

- `FastAPI` con `/health/live` y `/health/ready`;
- `PostgreSQL` via `Docker Compose`;
- `SQLAlchemy` async;
- `Alembic`;
- `pytest`, `Ruff`, `mypy` y `pre-commit`;
- `uv` con lockfile.

El nucleo funcional ya soporta:

- pacientes;
- atenciones;
- casos ART/incidente;
- eventos del caso;
- documentos del caso;
- filtros basicos de busqueda;
- reglas minimas de transicion de estado.
- autenticacion real por bearer token con Keycloak OIDC local;
- permisos basicos por rol.
- backoffice web inicial para operacion ART.
- portal medico web inicial para trabajo clinico.
- modulo propio de seguridad e IT.
- sesion web unificada entre modulos con navegacion por rol.

## Modelo de acceso

Los usuarios se separan en tres dominios:

- `Administrativos`
- `Medicos`
- `IT`

Y los permisos no se gestionan con una tabla propia dentro de la app, sino con `Keycloak`:

- grupos para ordenar personas;
- roles para habilitar funciones;
- la app solo consume esos roles para abrir o cerrar capacidades.

Importante:

- `admin` significa `IT/superusuario`, no administrativo operativo;
- los administrativos operativos van con `admission`, `billing`, `medical_auditor` o `support`;
- los medicos van con `doctor`.

Referencia:

- [Control de acceso](docs/access-control.md)

## Ejecucion local

Instalar dependencias:

```bash
python -m uv venv --seed .venv
python -m uv sync --dev
```

Levantar la API en desarrollo:

```bash
python -m uv run uvicorn openhealth_bridge.main:app --host 0.0.0.0 --port 8000 --reload
```

Levantar API, PostgreSQL y Keycloak con Docker:

```bash
cp .env.example .env
cp .env.api.example .env.api
cp .env.keycloak-bootstrap.example .env.keycloak-bootstrap
cp .env.keycloak-setup.example .env.keycloak-setup
cp .env.postgres.example .env.postgres
# completar los valores privados de .env antes de levantar el stack
# completar .env.api con las credenciales administrativas internas de Keycloak
# completar .env.keycloak-bootstrap con el usuario admin bootstrap de Keycloak
# completar .env.keycloak-setup con las credenciales de inicializacion de usuarios
# completar .env.postgres con base, usuario y password de PostgreSQL
docker compose up --build
```

## Webs reales

Para publicar una version real con tu dominio:

1. apuntar `aerosftp.com`, `www.aerosftp.com`, `api.aerosftp.com` y `auth.aerosftp.com` a la IP publica del servidor;
2. dejar esos records en `DNS only` hasta que el primer arranque emita certificados;
3. abrir puertos `80` y `443`;
4. cerrar `5432`, `8000` y `8081` hacia internet;
5. levantar el stack publico:

```bash
docker compose -f docker-compose.yml -f docker-compose.public.yml up --build -d
```

6. validar `https://www.aerosftp.com`, `https://api.aerosftp.com/docs` y `https://auth.aerosftp.com`;
7. cambiar los records a `Proxied` en Cloudflare;
8. en Cloudflare usar `SSL/TLS -> Full (strict)`.

Eso publica:

- `https://www.aerosftp.com`
- `https://centralsalud.aerosftp.com`
- `https://www.aerosftp.com/backoffice/`
- `https://www.aerosftp.com/medicos/`
- `https://www.aerosftp.com/seguridad/`
- `https://api.aerosftp.com`
- `https://api.aerosftp.com/docs`
- `https://auth.aerosftp.com`
- `https://auth.aerosftp.com/admin`

El overlay publico:

- deja expuestos solo `80` y `443`;
- oculta `postgres`, `api` y `keycloak` detras de `Caddy`;
- usa `auth.aerosftp.com` como issuer publico para OIDC.

Referencia operativa:

- [Runbook Cloudflare](docs/cloudflare-runbook.md)

## Sin VPS

Si hoy no hay VPS accesible, la opcion recomendada es `Cloudflare Tunnel`.

Preparacion:

1. crear un tunnel remoto en Cloudflare Zero Trust;
2. guardar el token en `.env.tunnel`;
3. completar `OPENHEALTH_DATABASE_URL`, `POSTGRES_PASSWORD` y passwords privadas en `.env.tunnel`;
4. levantar:

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml --env-file .env.tunnel up --build -d
```

Referencia operativa:

- [Runbook Cloudflare Tunnel](docs/cloudflare-tunnel-runbook.md)

## Backups

El stack ahora incluye un servicio `postgres-backup` que genera dumps de PostgreSQL en:

- `./backups/postgres`

Frecuencia actual:

- cada 6 horas

Retencion actual:

- 14 dias

Referencia operativa:

- [Runbook Raspberry](docs/raspberry-access.md)

En la Raspberry productiva conviene sobrescribir eso con un disco externo, por ejemplo:

```bash
POSTGRES_DATA_DIR_HOST=/mnt/hdd/openhealth-bridge/data/postgres
KEYCLOAK_DATA_DIR_HOST=/mnt/hdd/openhealth-bridge/data/keycloak
POSTGRES_BACKUP_DIR_HOST=/mnt/hdd/openhealth-bridge/backups/postgres
```

Importante:

- `PostgreSQL` y `Keycloak` necesitan un filesystem Linux nativo para sus datos vivos;
- si el disco externo esta en `NTFS`, usalo para dumps y archivos grandes, no para los directorios activos de base o identidad.

## Verificaciones

```bash
python -m uv run ruff check .
python -m uv run mypy src tests
python -m uv run pytest
```

## Prueba local real

- API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`
- Keycloak: `http://localhost:8081`
- Admin Keycloak: `http://localhost:8081/admin`

`docker compose` tambien ejecuta un seed automatico de usuarios demo para que el login por password grant funcione sin pasos manuales.

Usuarios demo del realm `openhealth`:

- `admin`
- `admission`
- `auditor`
- `billing`
- `doctor`
- `support`

Las contrasenas reales no se documentan: en la Raspberry quedan en `.env.tunnel`; en local se pueden definir con `OPENHEALTH_USER_*_PASSWORD`.

Grupos demo:

- `IT`: `admin`
- `Medicos`: `doctor`
- `Administrativos`: `admission`, `auditor`, `billing`, `support`

Pedir un token:

```bash
curl -X POST http://localhost:8081/realms/openhealth/protocol/openid-connect/token ^
  -H "Content-Type: application/x-www-form-urlencoded" ^
  -d "client_id=openhealth-dev" ^
  -d "grant_type=password" ^
  -d "username=admission" ^
  -d "password=%OPENHEALTH_USER_ADMISSION_PASSWORD%"
```

Usar ese `access_token` contra la API:

```bash
curl http://localhost:8000/api/v1/me ^
  -H "Authorization: Bearer ACCESS_TOKEN"
```

## Backoffice web

Primer acceso operativo real:

- landing: `https://www.aerosftp.com`
- tenant demo: `https://centralsalud.aerosftp.com/`
- backoffice: `https://www.aerosftp.com/backoffice/`
- portal medico: `https://www.aerosftp.com/medicos/`
- seguridad IT: `https://www.aerosftp.com/seguridad/`
- API: `https://api.aerosftp.com/docs`
- identidad: `https://auth.aerosftp.com/admin/`

El backoffice actual permite:

- iniciar sesion una sola vez con Keycloak;
- crear paciente, atencion y caso en un solo flujo;
- buscar casos por paciente, documento, profesional o ART;
- ver tablero operativo de admision y seguimiento;
- detectar datos administrativos faltantes;
- listar casos por filtros;
- ver detalle, eventos y documentos;
- actualizar estado;
- registrar notas operativas;
- abrir desde la misma sesion los modulos permitidos para su rol.

## Portal medico web

Primer corte clinico real:

- reutilizar la misma sesion del backoffice;
- revisar la bandeja de casos compartida;
- ordenar casos por prioridad clinica sugerida;
- ver pendientes del equipo y checklist del expediente;
- ver paciente, atencion, cobertura y trazabilidad del caso;
- registrar notas clinicas por medico;
- derivar a otros buzones operativos;
- adjuntar referencias documentales;
- registrar firma simple de trazabilidad;
- consultar documentos ya asociados al caso.

El ingreso de una clinica se realiza siempre desde su hostname, por ejemplo
`https://centralsalud.aerosftp.com/`. El login redirige automaticamente a cada
usuario segun su rol; las rutas internas no son puntos de acceso separados.

## Seguridad e IT

Primer corte de gestion propia sobre identidad:

- reutilizar la misma sesion del resto de la plataforma;
- listar grupos operativos;
- listar usuarios;
- crear usuarios;
- activar o bloquear acceso;
- cambiar grupos;
- resetear password desde la UI propia;
- mostrar solo los modulos habilitados para el rol actual.

## Endpoints actuales

- `GET /`
- `GET /health/live`
- `GET /health/ready`
- `GET /api/v1/me`
- `GET /api/v1/security/groups`
- `GET /api/v1/security/users`
- `POST /api/v1/security/users`
- `PATCH /api/v1/security/users/{id}`
- `POST /api/v1/patients`
- `GET /api/v1/patients/{id}`
- `POST /api/v1/encounters`
- `GET /api/v1/encounters`
- `GET /api/v1/encounters/{id}`
- `POST /api/v1/incident-cases`
- `GET /api/v1/incident-cases`
- `GET /api/v1/incident-cases/{id}`
- `PATCH /api/v1/incident-cases/{id}`
- `POST /api/v1/incident-cases/{id}/events`
- `GET /api/v1/incident-cases/{id}/events`
- `POST /api/v1/incident-cases/{id}/documents`
- `GET /api/v1/incident-cases/{id}/documents`

## Limitaciones de esta fase

- la autenticacion actual usa un realm local de Keycloak, no un IdP productivo;
- `Central Salud` ya existe como tenant demo por subdominio y experiencia propia, pero el aislamiento real de datos por clinica todavia no esta implementado en backend;
- el portal medico actual usa una bandeja compartida, todavia sin asignacion por profesional o equipo;
- no hay portal paciente;
- no hay upload binario real de archivos;
- ya existe aislamiento multi-tenant en el backend por `tenant_id` y `hostname`, pero todavia falta cerrar administracion tenant-aware, storage por tenant y mas defensas de produccion;
- no hay integracion con ART ni sistemas legacy;
- el modulo IT todavia depende de Keycloak como backend de identidad.

## Nota sobre VS Code y uv

La extension `Python Environments` de VS Code intenta consultar paquetes con `pip`. Por eso la instalacion local siembra `pip` dentro de `.venv` usando `uv venv --seed`, aunque la resolucion de dependencias siga haciendose con `uv`.

# AI Handoff

## Objetivo del producto

OpenHealth Bridge quiere venderse a clinicas como una plataforma web multi-tenant para equipos medicos, administrativos e IT.

El modelo objetivo es:

- una URL por clinica;
- login unico;
- una sola sesion;
- datos aislados por tenant;
- modulos internos segun rol.

## URLs actuales

- landing principal: `https://www.aerosftp.com`
- tenant demo: `https://centralsalud.aerosftp.com`
- portal medico: `https://www.aerosftp.com/medicos/`
- seguridad e IT: `https://www.aerosftp.com/seguridad/`
- API: `https://api.aerosftp.com/docs`
- Keycloak: `https://auth.aerosftp.com`

## Stack tecnico

- frontend estatico servido por Caddy;
- backend `FastAPI`;
- base `PostgreSQL`;
- identidad con `Keycloak`;
- routing publico con `Cloudflare Tunnel`;
- despliegue con `Docker Compose`.

## Estado funcional real

### Ya existe

- login real OIDC;
- sesion compartida entre modulos;
- portal medico inicial;
- modulo propio de Seguridad e IT;
- tenant demo `Central Salud`;
- host-aware frontend;
- base multi-tenant con `tenant_id`;
- membresias por tenant;
- API tenant-scoped.

### Todavia falta

- UI medica mucho mas profunda;
- expediente clinico mas completo;
- upload binario real;
- firma electronica;
- derivaciones;
- administracion tenant-aware de usuarios;
- storage segregado por tenant;
- integraciones reales con ART;
- portal paciente.

## Arquitectura multi-tenant actual

### Modelo

Existen:

- `tenants`
- `tenant_memberships`

Y las tablas de negocio ya usan `tenant_id`:

- `patients`
- `encounters`
- `incident_cases`
- `case_events`
- `case_documents`

### Resolucion del tenant

El tenant se resuelve por hostname en:

- [tenancy.py](D:/Proyectos/Salud/src/openhealth_bridge/tenancy.py)

La API valida:

- host activo;
- pertenencia del actor al tenant;
- acceso al recurso dentro del mismo tenant.

## Archivos clave

- [README.md](D:/Proyectos/Salud/README.md)
- [docs/raspberry-access.md](D:/Proyectos/Salud/docs/raspberry-access.md)
- [docs/tenant-onboarding.md](D:/Proyectos/Salud/docs/tenant-onboarding.md)
- [docs/multi-tenant-readiness.md](D:/Proyectos/Salud/docs/multi-tenant-readiness.md)
- [src/openhealth_bridge/api.py](D:/Proyectos/Salud/src/openhealth_bridge/api.py)
- [src/openhealth_bridge/security_api.py](D:/Proyectos/Salud/src/openhealth_bridge/security_api.py)
- [src/openhealth_bridge/tenancy.py](D:/Proyectos/Salud/src/openhealth_bridge/tenancy.py)
- [src/openhealth_bridge/models.py](D:/Proyectos/Salud/src/openhealth_bridge/models.py)
- [alembic/versions/20260721_000002_multi_tenant_foundation.py](D:/Proyectos/Salud/alembic/versions/20260721_000002_multi_tenant_foundation.py)

## Comandos utiles

Levantar stack tunnel:

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml --env-file .env.tunnel up --build -d
```

Levantar solo API de nuevo:

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml --env-file .env.tunnel up --build -d api
```

Validaciones locales:

```bash
python -m uv run ruff check src tests alembic
python -m uv run mypy src tests
python -m uv run pytest
```

## Proximo trabajo recomendado

1. dejar el despliegue estable luego de la migracion multi-tenant;
2. volver tenant-aware la UI y backend de Seguridad e IT;
3. crear un modulo medico mas fuerte con expediente, adjuntos y derivaciones;
4. definir storage real por tenant;
5. preparar onboarding interno para nuevas clinicas sin tocar codigo;
6. recien despues evaluar infraestructura mas compleja.

## Nota importante para cualquier otra IA

No asumir que Kubernetes resuelve el problema principal.

El problema central de negocio hoy es:

- aislamiento por clinica;
- UX util para medicos;
- administracion simple para IT;
- integraciones futuras con ART.

La infraestructura puede seguir sencilla mientras esas cuatro cosas queden solidas.

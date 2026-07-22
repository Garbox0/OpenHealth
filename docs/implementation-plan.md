# Plan de implementacion

## Supuestos

- vamos a empezar desde cero;
- el objetivo inmediato es validar el flujo ART/incidente, no toda la plataforma sanitaria;
- vamos a construir una sola plataforma multirol, no tres sistemas separados;
- la primera entrega sera backend solamente;
- usaremos datos sinteticos y nombres de demostracion.

## Riesgos

- intentar cubrir demasiados casos regulatorios desde el dia uno;
- mezclar flujo clinico con flujo administrativo sin separar prioridades;
- disenar para todas las instituciones antes de validar una sola;
- construir integraciones complejas antes de tener un nucleo util.

## Estrategia ponytail

Primero resolver lo indispensable:

1. modelo chico;
2. API simple;
3. trazabilidad minima;
4. datos sinteticos;
5. despliegue local.

Todo lo demas espera a que el flujo base exista y tenga sentido.

## Fases

### Fase 0: base tecnica minima

- repo estructurado;
- README;
- app FastAPI minima;
- health endpoints;
- Docker Compose con API y PostgreSQL;
- SQLAlchemy y Alembic;
- pytest, Ruff, mypy y pre-commit.

### Fase 1: nucleo ART/incidente

- tabla `incident_cases`;
- tablas minimas de `patients` y `encounters`;
- tabla `case_documents`;
- crear caso;
- listar caso;
- ver detalle;
- cambiar estado;
- `case_events` para auditoria ligera.

### Fase 2: reglas operativas

- validaciones de campos obligatorios;
- catalogos controlados;
- bandera visible de caso ART/incidente;
- busqueda por paciente, fecha y estado.

Estado actual:

- validacion de `art_name` para cobertura ART;
- validacion de consistencia entre paciente y atencion;
- transiciones controladas de estado;
- busqueda por paciente, atencion, estado, cobertura, tipo y rango de fecha;
- bandera `has_incident_case` en atenciones.

### Fase 3: integracion y endurecimiento

- autenticacion;
- tenancy si hace falta;
- adjuntos o referencias documentales;
- trazabilidad mejorada;
- hardening de seguridad;
- CI.

## Siguiente paso recomendado

La autenticacion base ya quedo resuelta para entorno local con Keycloak y bearer tokens.

Siguiente paso:

- fortalecer la experiencia del tenant demo `Central Salud`;
- hacer que el portal medico tenga expediente, documentos, derivaciones y firma operativa;
- cerrar Seguridad e IT como modulo propio tenant-aware;
- preparar integraciones ART sin prometer conectividad real hasta tener convenio o canal tecnico.

## Norte funcional

La primera venta apunta a clinicas. La plataforma debe sentirse como el espacio de trabajo de cada clinica: login unico, roles internos, expediente usable, trazabilidad y casos ART/incidente preparados.

Referencia competitiva:

- [Competencia: Access Informatica](competitor-access.md)

## Definicion de listo para Fase 0

- `docker compose up --build` levanta API y PostgreSQL;
- `docker compose up --build` levanta API, PostgreSQL y Keycloak;
- `GET /health/live` responde 200;
- `GET /health/ready` responde 200 cuando PostgreSQL esta disponible;
- `make lint`, `make typecheck` y `make test` existen y pasan.

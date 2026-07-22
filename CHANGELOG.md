# Changelog

## 2026-07-21

### Fase 3

- se evoluciono el backoffice administrativo con tablero operativo, busqueda contextual y pendientes de carga;
- se reemplazo la redireccion automatica post-login por un dashboard por rol con secciones de trabajo;
- se endurecio la landing quitando CSS inline, sacando `unsafe-inline` del CSP y moviendo tokens web a `sessionStorage`;
- se agrego theme propio de Keycloak para que el login use marca, colores y tipografia de OpenHealth/Central Salud;
- se localizaron los textos principales del login de Keycloak para que no aparezca como pantalla generica en ingles;
- se ajusto la composicion del login para incluir marca de clinica y firma OpenHealth, y se simplifico la landing sin texto explicativo innecesario;
- se simplifico el CTA de acceso institucional para evitar copy de seguridad innecesario.
- se retiro copy de seguridad innecesario tambien del login institucional de Keycloak.
- se documento el rol de cada hostname publico del tunnel y se apago la documentacion OpenAPI en el stack Docker real.
- se agrego al dashboard medico una tarjeta de proxima accion por expediente para orientar nota, documentacion, derivacion o firma.
- se simplifico el login de Keycloak y se desactivo cache de theme en Docker para iterar marca sin CSS viejo del navegador.
- se separo la landing comercial de `aerosftp.com` del acceso institucional de cada clinica, con propuesta de valor y CTAs de demo.
- se versionaron assets de la landing y se desactivo cache del site en Caddy durante la etapa de iteracion visual.
- se eliminaron passwords demo hardcodeadas del repo y el stack Docker ahora exige secretos por entorno;
- se movieron credenciales administrativas runtime de Keycloak a un `env_file` no versionado;
- se movieron credenciales bootstrap de Keycloak a un `env_file` no versionado;
- se movieron credenciales de inicializacion de Keycloak a un `env_file` no versionado para evitar falsos positivos de secret scanning;
- se movieron credenciales de PostgreSQL a un `env_file` no versionado;
- se corrigio el workflow de CI para validar dependencias con `uv pip check` sin depender de `pip` dentro del venv;
- se evoluciono el portal medico hacia una estacion de trabajo con prioridad clinica, pendientes de equipo y checklist del expediente;
- se movio el origen publico de OpenHealth Bridge a la Raspberry `judicia-scraper` usando `Cloudflare Tunnel`;
- se documento el set inicial de reglas WAF y rate limiting para Cloudflare Free;
- se agrego script operativo para rotar passwords demo y admin de Keycloak sin exponerlas en codigo;
- se rotaron las credenciales reales de Keycloak en la Raspberry y se sacaron passwords demo de la documentacion operativa;
- se ajustaron las reglas Cloudflare para proteger Keycloak/API sin romper el flujo OIDC del frontend;
- el portal medico ahora permite registrar derivaciones, referencias documentales y firma simple de trazabilidad desde el expediente;
- el rol `doctor` puede adjuntar referencias documentales al caso sin depender de un administrativo;
- el rol `doctor` puede derivar casos a buzones operativos permitidos sin poder cambiar estados administrativos;
- se agrego baseline OWASP, CSP/headers de seguridad, CORS acotado y hardening de Keycloak contra fuerza bruta;
- el cliente web `openhealth-dev` deja de aceptar password grant y queda en Authorization Code + PKCE;
- el home de cada clinica ahora funciona como workspace SSO y muestra solo los modulos habilitados por rol;
- el home de clinica deja de mostrar botones de modulos y redirige automaticamente al area correspondiente segun rol;
- se rediseño el lenguaje visual de la suite hacia una identidad clinica/institucional menos generica;
- se agrego branding configurable por tenant con monograma/color/logo y documentacion de personalizacion por cliente;
- se agrego logo vectorial propio de OpenHealth Bridge y guia de identidad visual con la paleta oficial;
- se documento la politica base de retencion clinica de 10 anos para Argentina y sus implicancias tecnicas;
- se agrego un servicio `postgres-backup` con dumps automaticos cada 6 horas y retencion de 14 dias en la Raspberry;
- se dejo el disco externo `NTFS` solo para backups porque `PostgreSQL` y `Keycloak` no pueden usarlo de forma sana como storage vivo;
- se agrego persistencia basica para `Keycloak` y reinicio automatico de servicios largos en el stack Docker;
- la web ahora envia `X-OpenHealth-Tenant` hacia `api.aerosftp.com` para que el backend preserve el contexto de clinica;
- la API acepta el tenant explicito por header para que el modelo multi-tenant funcione bien con dominio separado de backend;
- se agrego fundacion multi-tenant real en backend con `tenants`, `tenant_memberships` y `tenant_id` obligatorio en el nucleo;
- la API ahora resuelve el tenant por `hostname` y filtra recursos por clinica para evitar cruces de datos;
- se agrego una prueba automatica de aislamiento entre `www.aerosftp.com` y `centralsalud.aerosftp.com`;
- se endurecio la migracion multi-tenant para recuperar instalaciones inconsistentes donde faltaban tablas core;
- se actualizo la documentacion de readiness, onboarding y continuidad para reflejar el modelo multi-tenant actual;
- se rediseño la UI compartida de los modulos con una identidad visual mas consistente y vendible;
- el portal medico paso a tener panorama de guardia, alertas del expediente, mejor jerarquia visual y lectura clinica mas clara;
- la sesion y los roles ahora se presentan mejor en toda la suite, manteniendo el modelo SSO entre modulos;
- se habilito al rol `doctor` para registrar eventos clinicos sobre un caso existente;
- se publico el primer portal medico web con login real, bandeja clinica y notas del profesional;
- se sumo la ruta real `https://www.aerosftp.com/medicos/` a la documentacion y al cliente OIDC.
- se formalizo el modelo de acceso separando `Administrativos`, `Medicos` e `IT`;
- se agregaron grupos base en Keycloak para que la organizacion gestione usuarios y permisos sin tocar la app.
- se inicio el modulo propio de `Seguridad e IT` sobre Keycloak Admin REST;
- se agrego la ruta web `https://www.aerosftp.com/seguridad/` para gestion propia de accesos;
- se agrego documento de continuidad para retomar el proyecto con otra IA.
- se unifico la sesion web entre `backoffice`, `medicos` y `seguridad`;
- se agrego navegacion superior por rol para evitar relogueos entre modulos.
- se agrego `Central Salud` como tenant demo por subdominio;
- se preparo CORS, login OIDC, Caddy y landing host-aware para `centralsalud.aerosftp.com`.

## 2026-07-20

### Fase 3

- se reemplazo la autenticacion falsa por bearer tokens reales validados contra Keycloak OIDC local;
- se agrego el realm demo `openhealth` con usuarios y roles iniciales;
- se agrego un setup automatico para dejar operativas las passwords demo al levantar Docker;
- se separo `issuer` publico de `JWKS` interno para que la validacion funcione bien entre host y contenedores;
- se agrego un stack publico minimo con `Caddy` para publicar `www`, `api` y `auth` sobre `aerosftp.com`;
- se cerro la exposicion publica de `postgres`, `api` y `keycloak` cuando se usa el overlay publico;
- se agrego runbook de Cloudflare con DNS, cutover, SSL y puertos;
- se agrego overlay `docker-compose.tunnel.yml` para publicar por Cloudflare Tunnel sin VPS;
- se habilito el cliente web `openhealth-dev` con standard flow y PKCE;
- se agrego CORS para `https://www.aerosftp.com`;
- se publico el primer backoffice web con login real, bandeja de casos y alta operativa;
- se actualizo la documentacion de uso, despliegue y pruebas locales.

### Fase 2

- se agregaron reglas operativas para casos ART/incidente;
- `art_name` paso a ser obligatorio cuando `coverage_type=art`;
- se valida que la atencion pertenezca al paciente informado;
- se controlan transiciones validas de estado;
- se agregaron filtros de busqueda por paciente, atencion, estado, cobertura, tipo y rango de fecha;
- `encounters` ahora informan `has_incident_case`;
- se documento el uso de la API en `docs/api-usage.md`.
- se agregaron permisos basicos por rol para backoffice;
- se agrego `GET /api/v1/me` para inspeccionar el contexto actual.

### Fase 1

- se agregaron tablas para `patients`, `encounters`, `incident_cases`, `case_events` y `case_documents`;
- se implementaron endpoints CRUD minimos del nucleo;
- se agrego migracion Alembic para el core inicial;
- se agregaron pruebas de flujo basico del producto.

### Fase 0

- se creo la base tecnica con FastAPI, PostgreSQL, SQLAlchemy async, Alembic y Docker Compose;
- se agregaron healthchecks, tooling y CI inicial;
- se dejo la instalacion alineada con `uv` y VS Code.

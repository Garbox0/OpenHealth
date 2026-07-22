# Alta de clinicas en Zero Trust

## Objetivo

Este documento describe el flujo actual, de punta a punta, para agregar una nueva clinica como tenant web en OpenHealth Bridge.

Ejemplo usado en esta guia:

- clinica: `Central Salud`
- hostname: `centralsalud.aerosftp.com`

## Importante

Este runbook deja operativa la entrada por subdominio, el login y el workspace visible del tenant.

Al 21 de julio de 2026, el backend ya resuelve tenant por `hostname` y scopa los datos de negocio por `tenant_id`.

Lo que este runbook no hace por si solo es completar la parte administrativa y operativa del tenant, por ejemplo:

- usuarios reales de la clinica;
- permisos administrados por la propia clinica;
- storage productivo de archivos.

Para el estado general del aislamiento ver:

- [Preparacion multi-tenant](multi-tenant-readiness.md)

## Estado actual del producto

Hoy el tenant onboarding tiene cinco capas:

1. `frontend` host-aware
2. `Cloudflare Zero Trust` con published application route
3. `Keycloak` aceptando redirects y web origins del nuevo host
4. `API` aceptando CORS para el nuevo origen
5. `backend` resolviendo y validando el tenant desde el host

## Prerrequisitos

Antes de dar de alta una clinica nueva, confirmar:

- el dominio `aerosftp.com` ya esta activo en Cloudflare;
- el tunnel remoto `OpenHealth` ya esta conectado;
- `site`, `api` y `auth` ya estan corriendo;
- tenes acceso de administrador a:
  - Cloudflare Zero Trust;
  - Cloudflare DNS;
  - Keycloak admin;
  - este repo.

## Convencion recomendada

Para cada clinica nueva definir:

- `tenant slug`: corto, estable, sin espacios.
- `hostname`: `{slug}.aerosftp.com`
- `nombre visible`: por ejemplo `Central Salud`
- `mail de soporte del tenant`

Ejemplo:

- slug: `centralsalud`
- hostname: `centralsalud.aerosftp.com`
- nombre visible: `Central Salud`
- soporte: `it@centralsalud.demo`

## Paso 1: registrar el tenant en el frontend

Mientras no exista una tabla real de tenants, el registro visible del tenant vive en:

- [site/shared/tenant.js](D:/Proyectos/Salud/site/shared/tenant.js)

Agregar un bloque como este:

```js
{
  id: "centralsalud",
  kind: "clinic",
  name: "Central Salud",
  shortName: "Central Salud",
  hostnames: ["centralsalud.aerosftp.com"],
  supportEmail: "it@centralsalud.demo",
  loginLabel: "Ingresar al espacio de Central Salud",
  landing: {
    eyebrow: "Tenant demo",
    title: "El espacio digital de Central Salud para medicos, administrativos e IT.",
    copy: "....",
    status: "....",
  },
}
```

Esto controla:

- branding del landing;
- identificacion del tenant por `hostname`;
- textos visibles del espacio institucional.

## Paso 2: aceptar el hostname en el sitio publico

Agregar el host en:

- [deploy/caddy/Caddyfile](D:/Proyectos/Salud/deploy/caddy/Caddyfile)
- [deploy/caddy/Caddyfile.tunnel](D:/Proyectos/Salud/deploy/caddy/Caddyfile.tunnel)

Bloque actual esperado:

```caddy
centralsalud.aerosftp.com {
  import security_headers
  root * /srv/site
  encode zstd gzip
  file_server
}
```

Si se usa el overlay tunnel, recrear al menos el servicio `site`.

Ejemplo:

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml --env-file .env.tunnel up -d --force-recreate site
```

## Paso 3: habilitar el origen en la API

Agregar el host a los origins del frontend.

Hoy eso sale de:

- [src/openhealth_bridge/config.py](D:/Proyectos/Salud/src/openhealth_bridge/config.py)

Valor esperado:

```python
frontend_origins = "https://www.aerosftp.com,https://centralsalud.aerosftp.com"
```

En produccion conviene manejarlo por variable de entorno y no hardcodeado.

Despues recrear `api`.

Ejemplo:

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml --env-file .env.tunnel up --build -d api
```

## Paso 4: habilitar el host en Keycloak

El cliente OIDC actual es:

- realm: `openhealth`
- client: `openhealth-dev`

Hay que actualizar dos cosas:

1. version declarativa del repo:
   - [docker/keycloak/realm-openhealth.json](D:/Proyectos/Salud/docker/keycloak/realm-openhealth.json)
2. cliente real ya desplegado en `auth.aerosftp.com`

### Redirect URIs

Agregar:

- `https://centralsalud.aerosftp.com/backoffice/*`
- `https://centralsalud.aerosftp.com/medicos/*`
- `https://centralsalud.aerosftp.com/seguridad/*`

### Web origins

Agregar:

- `https://centralsalud.aerosftp.com`

### Post logout redirect URIs

Agregar:

- `https://centralsalud.aerosftp.com/backoffice/*`

## Paso 5: crear el published application route en Zero Trust

Segun la documentacion oficial actual de Cloudflare, para agregar una published application route hay que ir a `Networking > Tunnels`, elegir el tunnel y en `Routes` usar `Add route -> Published application`, luego completar subdomain, domain y service URL. Cloudflare indica ademas que al guardar, cualquiera en Internet puede acceder al hostname, y que si queres controlar quien entra, despues tenes que sumar una Access application. Fuente oficial: [Cloudflare One docs - Add a published application route](https://developers.cloudflare.com/cloudflare-one/networks/routes/add-routes/) y [Published applications](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/).

### Flujo en UI

1. Entrar a `Cloudflare Zero Trust`.
2. Ir a `Networks -> Tunnels & Mesh`.
3. Abrir el tunnel `OpenHealth`.
4. Ir a la pestaña `Published application routes`.
5. Click en `Add a published application route`.
6. Completar:
   - `Subdomain`: `centralsalud`
   - `Domain`: `aerosftp.com`
   - `Path`: vacio
   - `Type`: `HTTP`
   - `URL`: `site:80`
7. Guardar.

## Paso 6: revisar DNS en Cloudflare

Cloudflare documenta que al publicar una aplicacion via tunnel, la ruta publica se asocia a un record DNS que apunta al subdominio del tunnel (`<UUID>.cfargotunnel.com`). Fuente oficial: [Published applications](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/).

Despues de guardar:

1. Ir a `Cloudflare -> DNS -> Records`.
2. Buscar `centralsalud.aerosftp.com`.
3. Confirmar que existe y apunta al tunnel.

### Error comun

Si Cloudflare no te deja guardar porque ya existe un `A`, `AAAA` o `CNAME` con ese host, la propia documentacion oficial indica que hay que elegir otro hostname o borrar el record conflictivo antes de volver a guardar. Fuente: [Cloudflare One docs - Common errors](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/troubleshoot-tunnels/common-errors/).

## Paso 7: validar end to end

Validaciones minimas:

1. `https://centralsalud.aerosftp.com` abre.
2. El landing muestra branding de `Central Salud`.
3. `https://centralsalud.aerosftp.com/backoffice/` abre el modulo.
4. El login redirige a `auth.aerosftp.com` y vuelve al mismo host tenant.
5. La sesion se comparte entre `backoffice`, `medicos` y `seguridad`.
6. El preflight CORS desde `https://centralsalud.aerosftp.com` responde bien.

Chequeo tecnico rapido:

```bash
curl -i -X OPTIONS https://api.aerosftp.com/api/v1/me ^
  -H "Origin: https://centralsalud.aerosftp.com" ^
  -H "Access-Control-Request-Method: GET"
```

Esperado:

- `access-control-allow-origin: https://centralsalud.aerosftp.com`

## Paso 8: registrar el tenant en backend

El seed tecnico actual vive en:

- [src/openhealth_bridge/tenancy.py](D:/Proyectos/Salud/src/openhealth_bridge/tenancy.py)

Hoy hay una lista `SYSTEM_TENANTS` con los tenants bootstrap del sistema.

Para agregar una clinica nueva en este corte, sumar:

- `slug`
- `hostname`
- `display_name`

Y despues recrear `api` para que el tenant quede disponible en el bootstrap actual.

Nota:

Esto es un paso transitorio de esta fase. Mas adelante el alta debe salir de una tabla y una UI propia, no de un archivo.

## Paso 9: checklist de cierre

Antes de declarar el tenant listo:

- tenant agregado en `site/shared/tenant.js`
- Caddy actualizado
- API recreada
- Site recreado
- Keycloak declarativo actualizado
- Keycloak real actualizado
- route agregada en Zero Trust
- DNS validado
- tenant registrado en backend
- login probado
- modulo medico probado
- modulo seguridad probado

## Rollback

Si hay que deshacer el alta:

1. borrar la route del tunnel en Zero Trust;
2. borrar el DNS record si Cloudflare lo dejo creado;
3. quitar redirects y origin del cliente OIDC;
4. quitar el tenant de `site/shared/tenant.js`;
5. recrear `site` y `api`.

## Lo que hay que mejorar despues

Este flujo hoy sirve para demos y primeros pilotos, pero no es el onboarding final.

Lo correcto mas adelante es:

- tabla real de tenants/clinicas;
- alta desde UI propia o panel interno;
- propagacion automatica a identity y routing;
- no tocar archivos para sumar una clinica;
- administracion de usuarios y permisos acotada al tenant actual.

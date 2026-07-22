# Runbook Cloudflare Tunnel para aerosftp.com

## Decision

Si no hay VPS accesible hoy, no vamos a inventar infraestructura.

Vamos a publicar OpenHealth Bridge con:

- Cloudflare DNS
- Cloudflare Tunnel
- Docker local o en Raspberry

Esto evita depender de:

- IP publica fija
- NAT y port forwarding
- puertos `80` y `443` abiertos
- un VPS listo desde el dia uno

## Dato real de hoy

Al 20 de julio de 2026, la IP publica visible desde esta maquina es:

- `190.17.69.254`

Pero no la recomiendo como origen por DNS directo porque puede cambiar y ademas puede quedar bloqueada por NAT o firewall domestico.

## Que mantiene Cloudflare

Tus registros DNS pueden seguir asi:

- `A` `@` -> `147.93.9.185`
- `A` `www` -> `147.93.9.185`
- `A` `api` -> `147.93.9.185`
- `A` `auth` -> `147.93.9.185`

Pero para Tunnel, lo ideal es que Cloudflare termine administrando los hostnames del tunel desde Zero Trust.

## Paso 1: activar la zona

Cambiar los nameservers del dominio en Hostinger a:

- `arch.ns.cloudflare.com`
- `edna.ns.cloudflare.com`

Esperar a que Cloudflare marque la zona como activa.

## Paso 2: crear un tunnel en Cloudflare

En Cloudflare Zero Trust:

1. ir a `Networks -> Tunnels`
2. crear un tunnel remoto
3. elegir `Docker`
4. copiar el token del comando de instalacion

Cloudflare documenta este flujo oficial en:

- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/
- https://developers.cloudflare.com/tunnel/advanced/tunnel-tokens/

## Paso 3: definir hostnames publicos

Dentro del tunnel, agregar estos public hostnames:

- `www.aerosftp.com` -> `http://site:80`
- `aerosftp.com` -> `http://site:80`
- `centralsalud.aerosftp.com` -> `http://site:80`
- `api.aerosftp.com` -> `http://api:8000`
- `auth.aerosftp.com` -> `http://keycloak:8080`

## Inventario de hostnames

Todos estos hostnames son publicos porque Cloudflare los resuelve en Internet. Lo importante es que el origen no queda expuesto directo y que cada servicio valide autenticacion, permisos y tenant.

- `centralsalud.aerosftp.com`: workspace de la clinica demo. Publico como pantalla de login; los datos requieren token, rol y tenant.
- `auth.aerosftp.com`: login OIDC/Keycloak. Debe ser publico para que los usuarios inicien sesion. El admin de Keycloak debe quedar bloqueado por WAF salvo IP/VPN.
- `api.aerosftp.com`: API compartida. Debe ser publica para la web, pero los endpoints de negocio exigen bearer token y `X-OpenHealth-Tenant`; en produccion no publica `/docs`, `/redoc` ni `/openapi.json`.
- `aerosftp.com` y `www.aerosftp.com`: entrada general del producto. Hoy apuntan al site; no deben mostrar datos internos. Mas adelante pueden ser landing comercial o redireccionar a un tenant.

La documentacion oficial para publicar aplicaciones es:

- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/

## Paso 4: guardar el token localmente

Crear `.env.tunnel` a partir de `.env.tunnel.example`:

```bash
CLOUDFLARE_TUNNEL_TOKEN=eyJ...
```

## Paso 5: levantar el stack

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml --env-file .env.tunnel up --build -d
```

## Resultado esperado

- `https://www.aerosftp.com`
- `https://api.aerosftp.com/docs`
- `https://auth.aerosftp.com`

Sin exponer puertos publicos del origen.

## Kubernetes

No conviene meter Kubernetes antes de tener:

- un nodo estable para produccion;
- persistencia definida;
- backups;
- monitoreo;
- al menos dos o tres servicios que realmente necesiten scheduling y alta disponibilidad.

Hoy el paso correcto es:

1. Docker Compose
2. Cloudflare Tunnel
3. primer uso real
4. despues evaluar `k3s` en Raspberry o VPS

Si queres disponibilidad real mas adelante, la version sana no es Kubernetes “porque si”, sino:

- `k3s`
- PostgreSQL administrado o al menos backup serio
- un segundo nodo
- healthchecks y observabilidad

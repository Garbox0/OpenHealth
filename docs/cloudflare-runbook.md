# Runbook Cloudflare para aerosftp.com

## Objetivo

Dejar `aerosftp.com` operando detras de Cloudflare con una sola entrada publica:

- `https://www.aerosftp.com`
- `https://api.aerosftp.com`
- `https://auth.aerosftp.com`

El origen expone solo:

- `80/tcp`
- `443/tcp`

No deben quedar expuestos:

- `5432`
- `8000`
- `8081`

## IP de origen actual

- `147.93.9.185`

Si mas adelante cambia el servidor, hay que actualizar todos los `A` records.

## DNS final en Cloudflare

Crear o dejar estos registros:

- `A` `@` -> `147.93.9.185`
- `A` `www` -> `147.93.9.185`
- `A` `api` -> `147.93.9.185`
- `A` `auth` -> `147.93.9.185`

## Orden correcto del cutover

### Paso 1

Dejar los cuatro registros en `DNS only` por el primer arranque.

Esto le da tiempo a `Caddy` para emitir certificados publicos para:

- `aerosftp.com`
- `www.aerosftp.com`
- `api.aerosftp.com`
- `auth.aerosftp.com`

### Paso 2

Levantar el stack publico:

```bash
docker compose -f docker-compose.yml -f docker-compose.public.yml up --build -d
```

### Paso 3

Validar directamente desde internet:

- `https://www.aerosftp.com`
- `https://api.aerosftp.com/docs`
- `https://auth.aerosftp.com`

### Paso 4

Cambiar esos cuatro registros a `Proxied` en Cloudflare.

## Ajustes de Cloudflare

En `SSL/TLS`:

- modo `Full (strict)`
- `Always Use HTTPS` -> `On`
- `Automatic HTTPS Rewrites` -> `On`
- `Minimum TLS Version` -> `TLS 1.2`

En `Caching` y `Rules` no hace falta tocar nada todavia.

## Firewall del servidor

Abrir:

- `80`
- `443`

Cerrar hacia internet:

- `5432`
- `8000`
- `8081`

## Arquitectura final

Cloudflare recibe el trafico, lo protege y lo pasa al origen.

El origen responde asi:

- `www.aerosftp.com` -> `Caddy` -> sitio estatico
- `api.aerosftp.com` -> `Caddy` -> `FastAPI`
- `auth.aerosftp.com` -> `Caddy` -> `Keycloak`

`PostgreSQL` queda solo interno.

## Verificacion rapida

La configuracion esta bien si:

- el navegador abre `www`, `api` y `auth` por `https`;
- Cloudflare muestra nube naranja en esos cuatro registros;
- `docker compose ps` ya no muestra publicados `5432`, `8000` ni `8081` cuando se usa el overlay publico;
- `GET https://api.aerosftp.com/health/live` responde `200`.

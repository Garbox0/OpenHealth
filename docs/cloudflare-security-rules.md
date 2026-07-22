# Reglas Cloudflare Free recomendadas

## Managed Rules

Activar:

- `Cloudflare Free Managed Ruleset`

Ruta:

- `Security -> WAF -> Managed rules`

## Custom Rules

Crear estas reglas en:

- `Security -> WAF -> Custom rules`

### 1. Bloquear admin de Keycloak salvo IP propia

Expression:

```txt
(http.host eq "auth.aerosftp.com" and starts_with(http.request.uri.path, "/admin") and not ip.src in {TU_IP_PUBLICA/32})
```

Action:

- `Block`

Si la IP cambia seguido, usar `Managed Challenge` hasta tener IP fija o acceso por VPN.

### 2. Bloquear realm `master` de Keycloak salvo IP propia

Expression:

```txt
(http.host eq "auth.aerosftp.com" and starts_with(http.request.uri.path, "/realms/master") and not ip.src in {TU_IP_PUBLICA/32})
```

Action:

- `Block`

El login de usuarios usa el realm `openhealth`; el realm `master` queda solo para administracion.

### 3. Bloquear Swagger/OpenAPI salvo IP propia

Expression:

```txt
(http.host eq "api.aerosftp.com" and (http.request.uri.path eq "/docs" or http.request.uri.path eq "/redoc" or http.request.uri.path eq "/openapi.json") and not ip.src in {TU_IP_PUBLICA/32})
```

Action:

- `Block`

### 4. Bloquear metodos peligrosos no usados

Expression:

```txt
(http.host in {"api.aerosftp.com" "auth.aerosftp.com" "www.aerosftp.com" "centralsalud.aerosftp.com"} and http.request.method in {"TRACE" "CONNECT"})
```

Action:

- `Block`

### 5. Bloquear scanners comunes

Expression:

```txt
(http.request.uri.path contains "/.env" or http.request.uri.path contains "/wp-admin" or http.request.uri.path contains "/wp-login" or http.request.uri.path contains "/phpmyadmin" or http.request.uri.path contains "/server-status")
```

Action:

- `Block`

## Rate Limiting

Crear esta regla en:

- `Security -> WAF -> Rate limiting rules`

Expression:

```txt
(http.host eq "auth.aerosftp.com" and http.request.uri.path contains "/protocol/openid-connect/token")
```

Configuracion:

- threshold: `10 requests`
- period: `1 minute`
- action: `Managed Challenge` si esta disponible; si el plan Free solo permite `Block`, usar `Block` con umbral mas generoso, por ejemplo `20 requests / 1 minute`
- mitigation timeout: `10 minutes`
- characteristics: `IP`

## Notas

- No usar `Allow` global por IP salvo necesidad clara, porque puede saltear reglas de seguridad.
- No crear una custom rule que aplique `Managed Challenge` siempre sobre `/protocol/openid-connect/token`: puede romper el intercambio OIDC del frontend. Para ese endpoint usar solo rate limiting.
- Si ya existe una custom rule llamada `Challenge al endpoint de login/token`, dejarla desactivada.
- Mantener `api.aerosftp.com/health/live` libre para verificaciones publicas.

# Estrategia de despliegue

## Decision principal

No vamos a distribuir un zip por cliente ni a instalar la app completa en el servidor de cada uno.

Vamos a usar:

- una plataforma central operada por nosotros;
- acceso web por navegador;
- despliegue unico por version;
- conectores locales solo si algun cliente realmente los necesita.

## Lo que descartamos

Queda descartado este modelo:

- copiar archivos a mano;
- IIS por cliente;
- una version distinta en cada institucion;
- entrar servidor por servidor para actualizar.

Eso genera soporte caro, divergencia funcional y trazabilidad pobre.

## Modelo recomendado para la prueba

Para la primera prueba publica necesitamos solo tres piezas:

1. un host publico donde corra Docker;
2. el dominio;
3. DNS apuntando a ese host.

La base del producto sigue siendo la misma:

- `FastAPI` para backend;
- `PostgreSQL` privado;
- contenedores;
- un proxy reverso delante para HTTPS y routing por dominio.

## Implementacion minima elegida

Para no complicarnos, la primera publicacion real queda asi:

- `Caddy` como proxy reverso y TLS automatico;
- `api.aerosftp.com` -> `FastAPI`;
- `auth.aerosftp.com` -> `Keycloak`;
- `www.aerosftp.com` -> sitio estatico simple.
- `Cloudflare` por delante de todo el trafico publico.

Archivo de arranque publico:

- `docker-compose.public.yml`

Runbook operativo:

- `docs/cloudflare-runbook.md`
- `docs/cloudflare-tunnel-runbook.md`

## Variante sin VPS

Si no tenemos un servidor publico accesible todavia, la variante correcta es:

- `Cloudflare Tunnel`
- `Docker Compose`
- maquina local o Raspberry como origen saliente

Eso nos permite probar webs reales sin abrir puertos ni depender de una IP fija desde el dia uno.

## Uso sugerido del dominio

Dominio disponible:

- `aerosftp.com`

Propuesta de subdominios:

- `api.aerosftp.com` -> backend API
- `admin.aerosftp.com` -> backoffice ART
- `doctor.aerosftp.com` -> vista medica futura
- `paciente.aerosftp.com` -> portal paciente futuro
- `www.aerosftp.com` -> landing o pagina institucional

Para una prueba corta, alcanza con:

- `api.aerosftp.com`
- `auth.aerosftp.com`
- `www.aerosftp.com`

## DNS minimo

Segun la documentacion oficial de Hostinger, si el dominio sigue usando nameservers de Hostinger, podes apuntarlo a servicios externos o a una VPS agregando registros DNS en hPanel.

Enlaces oficiales:

- Hostinger: [Point a domain to external services](https://www.hostinger.com/support/4737652-how-to-point-a-domain-to-external-services-at-hostinger/)
- Hostinger: [Point a domain to your VPS](https://www.hostinger.com/support/1583227-how-to-point-a-domain-to-your-vps-at-hostinger/)

Configuracion sugerida para una prueba simple:

- `A` para `@` -> IP publica del host
- `A` para `api` -> misma IP publica del host
- `A` para `auth` -> misma IP publica del host
- `A` para `www` -> misma IP publica del host o `CNAME` a `@`

El proxy reverso decide despues que servicio responde cada host.

Con Cloudflare, conviene hacer el primer arranque en `DNS only` y pasar a `Proxied` despues de validar el HTTPS del origen.

## Arquitectura operativa

### Publico

- `Cloudflare`
- `reverse proxy`

### Privado

- `api`
- `keycloak`
- `postgres`

La base de datos no debe exponerse a internet.

## Actualizaciones modernas

El flujo que queremos es este:

1. hacemos cambios en el repo;
2. corremos verificaciones;
3. construimos imagen nueva;
4. desplegamos una sola vez;
5. todos los usuarios quedan en la nueva version.

No hay copias manuales por cliente.

## Clientes con sistemas legacy

Si mas adelante un cliente necesita integracion local, no instalamos la plataforma entera en su servidor.

Instalamos, como mucho:

- un conector pequeno;
- un importador;
- un agente de sincronizacion.

La logica principal sigue centralizada.

## Orden recomendado

### Paso 1

Publicar la API actual con dominio y HTTPS.

### Paso 2

Publicar Keycloak con dominio propio o subdominio y reemplazar el realm demo local.

### Paso 3

Agregar un backoffice web minimo en `admin.aerosftp.com`.

### Paso 4

Sumar conectores o integraciones puntuales.

## Definicion de exito de la primera prueba

La prueba sale bien si:

- el dominio responde;
- `www.aerosftp.com` abre un sitio real;
- `api.aerosftp.com` expone la API;
- `auth.aerosftp.com` expone el login real;
- Cloudflare queda en `Full (strict)`;
- `/health/live` y `/health/ready` funcionan por internet;
- podemos desplegar una nueva version sin tocar servidores de clientes.

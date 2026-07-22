# Runbook Raspberry

## Resumen

Al 21 de julio de 2026, la Raspberry disponible para infraestructura queda identificada asi:

- nombre del host: `judicia-scraper`
- nombre en Tailscale: `nitalabs-pi`
- usuario operativo: `pi`
- IP LAN: `192.168.0.179`
- IP Tailscale: `100.80.237.96`
- disco externo montado: `/mnt/hdd`
- espacio libre en disco externo: `~465 GB`

## Como entrar

### Desde la red local

```bash
ssh pi@192.168.0.179
```

### Desde Tailscale

```bash
ssh pi@100.80.237.96
```

Alternativa por nombre:

```bash
tailscale ssh pi@nitalabs-pi
```

Nota:

- el nodo tiene `RunSSH: true`;
- en algunos clientes el primer acceso por Tailscale puede pedir autenticacion web adicional.

## Estado verificado

Chequeado el 21 de julio de 2026:

- `eth0`: `192.168.0.179/24`
- `tailscale0`: `100.80.237.96`
- Docker instalado
- stack OpenHealth Bridge publicado desde esta maquina

Servicios activos del stack:

- `current-postgres-1`
- `current-keycloak-1`
- `current-api-1`
- `current-site-1`
- `current-cloudflared-1`

Contenedores legacy detenidos:

- `evolution-go-poc`
- `staging-agent`
- `staging-postgres`

## Comandos utiles

Ver interfaces:

```bash
ip -brief a
```

Ver estado de Docker:

```bash
docker ps
docker ps -a
```

Ver estado del stack OpenHealth:

```bash
cd ~/openhealth-bridge/current
docker compose ps
docker logs --tail=50 current-cloudflared-1
docker logs --tail=50 current-postgres-backup-1
```

Ver estado de Tailscale:

```bash
tailscale status
tailscale debug prefs
```

Rotar passwords demo y admin de Keycloak:

```bash
cd ~/openhealth-bridge/current
sh deploy/rotate-keycloak-passwords.sh .env.tunnel
```

Aplicar hardening de Keycloak:

```bash
cd ~/openhealth-bridge/current
sh deploy/harden-keycloak.sh .env.tunnel
```

## Nota operativa

Hoy esta Raspberry sirve como candidato real para:

- correr `cloudflared`;
- correr el stack Docker de OpenHealth Bridge;
- funcionar como origen privado detras de Cloudflare Tunnel.

## Despliegue actual

Codigo desplegado en:

- `~/openhealth-bridge/current`

Bundle de despliegue usado:

- `~/openhealth-bridge/openhealth-pi.tgz`

Comando de arranque:

```bash
cd ~/openhealth-bridge/current
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml --env-file .env.tunnel up --build -d
```

Comando para reiniciar solo el tunel:

```bash
cd ~/openhealth-bridge/current
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml --env-file .env.tunnel up -d cloudflared
```

## Backup de base de datos

El stack corre un servicio `postgres-backup` que:

- genera un dump `pg_dump -Fc`;
- guarda archivos en el host indicado por `POSTGRES_BACKUP_DIR_HOST`;
- corre cada 6 horas;
- borra dumps con mas de 14 dias.

Configuracion productiva actual en Raspberry:

- `POSTGRES_DATA_DIR_HOST=postgres_data`
- `KEYCLOAK_DATA_DIR_HOST=keycloak_data`
- `POSTGRES_BACKUP_DIR_HOST=/mnt/hdd/openhealth-bridge/backups/postgres`

Persistencia actual en disco externo:

- dumps en `/mnt/hdd/openhealth-bridge/backups/postgres`

Importante:

- el disco externo actual esta en `NTFS`;
- `PostgreSQL` fallo por ownership al intentar vivir ahi;
- `Keycloak` tambien fallo por I/O al intentar usar su `H2` sobre `NTFS`;
- por eso los datos vivos siguen en volumen Docker y solo los backups van al disco externo.

Si mas adelante queres mover los datos vivos fuera de la microSD, el camino correcto es:

- usar un disco o particion `ext4` para `POSTGRES_DATA_DIR_HOST`;
- usar un disco o particion `ext4` para `KEYCLOAK_DATA_DIR_HOST`.

Ver backups guardados:

```bash
ls -lh /mnt/hdd/openhealth-bridge/backups/postgres
```

Forzar un backup manual:

```bash
cd ~/openhealth-bridge/current
docker compose run --rm postgres-backup /bin/sh -ec '
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  export PGPASSWORD="$POSTGRES_PASSWORD"
  pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "/backups/${POSTGRES_DB}_${timestamp}.dump"
  ls -lh /backups
'
```

Restore manual:

```bash
cd ~/openhealth-bridge/current
export PGPASSWORD="$(grep -E '^POSTGRES_PASSWORD=' .env.tunnel | tail -n 1 | cut -d= -f2-)"
docker compose exec -T postgres dropdb -U postgres --if-exists openhealth_bridge
docker compose exec -T postgres createdb -U postgres openhealth_bridge
docker compose exec -T postgres sh -lc 'cat > /tmp/restore.dump' < /mnt/hdd/openhealth-bridge/backups/postgres/ARCHIVO.dump
docker compose exec -T postgres pg_restore -U postgres -d openhealth_bridge /tmp/restore.dump
docker compose exec -T postgres rm -f /tmp/restore.dump
```

Pendientes importantes:

- monitoreo minimo;
- decidir si el stack local queda como fallback o se apaga por completo.

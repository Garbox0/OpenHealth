# Control de acceso

OpenHealth Bridge separa personas y permisos en tres dominios operativos:

- `Administrativos`
- `Medicos`
- `IT`

La regla base es simple:

- los `grupos` ordenan a las personas;
- los `roles` habilitan funciones concretas;
- la gestion de altas, bajas y permisos vive en `Keycloak`, no en tablas caseras dentro de la app.
- la sesion debe ser unica dentro de la plataforma y no pedir login por cada modulo.

## Grupos iniciales

- `Administrativos`
- `Medicos`
- `IT`

## Roles iniciales

- `admin`
  Uso: IT o superusuario de plataforma.
- `administrative`
  Uso: admision, seguimiento, auditoria y operatoria administrativa.
- `doctor`
  Uso: trabajo clinico.

## Mapeo recomendado

- Grupo `Administrativos`
  Roles: `administrative`
- Grupo `Medicos`
  Roles: `doctor`
- Grupo `IT`
  Roles: `admin`

## Workspace por clinica

Cada clinica entra por su propio hostname, por ejemplo:

- `https://centralsalud.aerosftp.com/`

Ese home inicia sesion por SSO y redirige automaticamente al area correspondiente:

- `admin` -> `Seguridad e IT`.
- `doctor` -> `Portal medico`.
- `administrative` -> `Backoffice`.

Los modulos usan el mismo token OIDC y el mismo tenant, asi que el usuario no deberia reloguearse al moverse entre secciones permitidas.

## Regla importante

`admin` no significa administrativo de clinica.

`admin` significa acceso tecnico total: configuracion, soporte de plataforma, cambios de seguridad o recuperacion.

Para usuarios de operacion diaria conviene evitar `admin` y usar `administrative` o `doctor`.

## Gestion autonoma

La idea del producto es que cada organizacion pueda autogestionarse asi:

1. IT crea o desactiva usuarios.
2. IT o un referente autorizado los mete en grupos.
3. Los grupos entregan los roles correctos.
4. La app habilita funciones segun esos roles.

## Siguiente paso natural

Cuando avancemos la UI, conviene agregar una vista de:

- listado de usuarios;
- grupos;
- roles efectivos;
- alta/baja;
- cambio de grupo;
- auditoria minima de permisos.

Pero esa vista debe operar sobre Keycloak, no duplicar identidad dentro de OpenHealth Bridge.

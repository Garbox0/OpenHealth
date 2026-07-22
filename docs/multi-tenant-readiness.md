# Preparacion multi-tenant

## Respuesta corta

Si, ya existe una base real para aislar clinicas en la misma plataforma.

No, todavia no estamos en el punto de vender a diez clinicas con promesa de aislamiento "enterprise grade" sin cerrar algunos huecos mas.

Al martes 21 de julio de 2026, OpenHealth Bridge ya tiene aislamiento multi-tenant en el nucleo de negocio:

- tabla `tenants`;
- membresias `tenant_memberships`;
- `tenant_id` obligatorio en pacientes, atenciones, casos, eventos y documentos;
- resolucion del tenant por `hostname`;
- scoping obligatorio en la API;
- prueba automatica de no cruce entre hosts.

## Que ya esta resuelto

### 1. Espacio de trabajo por clinica

Cada clinica entra por su propio host, por ejemplo:

- `www.aerosftp.com`
- `centralsalud.aerosftp.com`

El backend resuelve el tenant a partir del host y no desde un selector manual en pantalla.

Cada tenant tambien puede tener branding propio: nombre visible, monograma, color acento y logo. El estilo base sigue siendo comun para que el producto sea consistente.

### 2. Aislamiento real en datos de negocio

Las entidades principales ya tienen `tenant_id` obligatorio:

- [Tenant](D:/Proyectos/Salud/src/openhealth_bridge/models.py)
- [TenantMembership](D:/Proyectos/Salud/src/openhealth_bridge/models.py)
- [Patient](D:/Proyectos/Salud/src/openhealth_bridge/models.py)
- [Encounter](D:/Proyectos/Salud/src/openhealth_bridge/models.py)
- [IncidentCase](D:/Proyectos/Salud/src/openhealth_bridge/models.py)
- [CaseEvent](D:/Proyectos/Salud/src/openhealth_bridge/models.py)
- [CaseDocument](D:/Proyectos/Salud/src/openhealth_bridge/models.py)

Eso hace que cada fila de negocio pertenezca explicitamente a una clinica.

### 3. La API ya corta por tenant

La API no solo autentica por rol.

Tambien:

- resuelve el tenant desde el host;
- verifica membresia del actor en ese tenant;
- crea datos con el `tenant_id` correcto;
- devuelve `404` si un recurso existe pero pertenece a otra clinica.

Referencia:

- [API multi-tenant](D:/Proyectos/Salud/src/openhealth_bridge/api.py)
- [Resolucion de tenant](D:/Proyectos/Salud/src/openhealth_bridge/tenancy.py)

### 4. Ya hay prueba automatica de no cruce

Existe un test que crea un caso en `www.aerosftp.com` y valida que ese mismo ID no pueda leerse desde `centralsalud.aerosftp.com`.

Referencia:

- [tests/test_api.py](D:/Proyectos/Salud/tests/test_api.py)

## Lo que todavia falta antes de vender a varias clinicas reales

### 1. Aislamiento fuerte tambien en identidad

Hoy la pertenencia a tenant existe en nuestra base por `tenant_memberships`, pero la capa de administracion de usuarios todavia usa un backend global de Keycloak.

Falta:

- provisionar usuarios por tenant desde nuestra propia UI;
- evitar que IT de una clinica gestione usuarios de otra;
- reflejar tenant tambien en claims o mapeos de identidad.

### 2. Separacion real de archivos por tenant

`CaseDocument` ya tiene `tenant_id`, pero todavia no hay upload binario productivo ni una convencion dura de storage.

Antes de salir a produccion multi-clinica hay que imponer claves de storage como:

- `tenant/centralsalud/cases/{case_id}/archivo.pdf`

### 3. Auditoria y administracion tenant-aware

Necesitamos que la UI de Seguridad e IT opere dentro del tenant actual, no como consola global maquillada.

### 4. Defensa extra en base de datos

La app ya filtra por tenant.

La siguiente capa recomendada es:

- indices compuestos por tenant donde haga falta;
- `Row-Level Security` en PostgreSQL cuando empecemos a manejar datos sensibles reales de mas de una clinica.

## Entonces, cada clinica tendra su "contenedor"?

No en el sentido literal de "un Docker por clinica".

Y eso esta bien.

La estrategia correcta para esta etapa es:

- una plataforma compartida;
- tenants aislados logica y funcionalmente;
- control duro por `tenant_id`, host y permisos.

Eso es mucho mas mantenible que levantar un stack entero por clinica desde el dia uno.

Solo conviene separar infraestructura por cliente cuando:

- un contrato lo exige;
- hay requisitos regulatorios duros;
- o algun cliente paga por aislamiento fisico dedicado.

## Necesitamos Kubernetes?

No para resolver este problema.

Kubernetes ayuda en:

- alta disponibilidad;
- replicas;
- despliegues ordenados;
- operacion a escala.

Kubernetes no evita que una clinica vea datos de otra.

Ese problema se resuelve en:

- modelo de datos;
- autenticacion;
- autorizacion;
- queries;
- storage;
- auditoria.

## Recomendacion concreta

Para empezar a vender pilotos serios:

1. mantener una sola plataforma multi-tenant;
2. terminar el scoping tenant-aware del modulo de Seguridad e IT;
3. cerrar storage por tenant;
4. agregar auditoria de acciones sensibles;
5. recien despues evaluar RLS y, mas adelante, `k3s` o Kubernetes si la operacion lo pide.

## Dictamen final

Ya no estamos en "demo sin aislamiento".

Ya tenemos una fundacion multi-tenant real en backend.

Lo que falta no es rehacer la arquitectura, sino completar las capas de identidad, storage y administracion para que esa separacion sea vendible con tranquilidad a multiples clinicas.

# Producto MVP: Incidentes y ART

## Problema

En muchas instituciones la atencion vinculada a ART o a un incidente sigue un circuito distinto del de una consulta comun. El problema no es solo "avisar al medico", sino coordinar a varias areas con el mismo contexto:

- admision;
- profesionales;
- auditoria;
- autorizaciones;
- facturacion;
- seguimiento administrativo.

Cuando ese contexto no existe o queda disperso, aparecen errores:

- faltan datos obligatorios;
- el medico no sabe que el caso tiene circuito ART;
- auditoria y facturacion trabajan con informacion incompleta;
- se pierde trazabilidad;
- se retrasa el cobro o la gestion del siniestro.

## Hipotesis de producto

Si damos a la institucion un backend simple para registrar, marcar y seguir casos ART/incidente desde el inicio de la atencion, entonces reducimos errores operativos y mejoramos trazabilidad sin exigir cambiar todo su sistema clinico.

## Usuario inicial

Usuarios primarios:

- recepcion o admision;
- medicos de la clinica;
- auditoria medica;
- facturacion;
- soporte operativo.

Usuario secundario:

- IT de la clinica, que necesita gestionar usuarios, roles y accesos sin entrar a una consola externa.

Usuario futuro:

- paciente, con acceso acotado a su propia informacion.

## Historia principal

> Como personal de admision, quiero registrar que una atencion corresponde a un incidente o ART, completar los datos minimos del caso y dejarlo asociado al paciente, para que el resto de las areas trabaje con el mismo contexto.

## MVP real

El MVP no intenta resolver todo ART. Solo resuelve el tramo minimo comun:

1. crear un caso;
2. asociarlo a un paciente;
3. asociarlo a una atencion;
4. guardar datos administrativos minimos;
5. exponer una bandera de "caso ART/incidente";
6. consultar el estado y la trazabilidad.

La primera superficie de producto no sera un portal medico ni un portal paciente. Sera un backoffice operativo sobre un nucleo comun.

## Datos minimos del caso

Campos sugeridos para el primer corte:

- `case_id`
- `patient_id`
- `encounter_id`
- `coverage_type`
- `incident_type`
- `incident_date`
- `reported_by`
- `employer_name`
- `art_name`
- `claim_number`
- `status`
- `notes`
- `created_at`
- `updated_at`

## Catalogos iniciales

### coverage_type

- `art`
- `private`
- `unknown`

### incident_type

- `work_accident`
- `commute_accident`
- `occupational_exposure`
- `other`

### status

- `open`
- `in_review`
- `authorized`
- `rejected`
- `closed`

## Flujo minimo

1. se registra o identifica al paciente;
2. se crea una atencion;
3. admision marca si la atencion corresponde a incidente/ART;
4. el sistema exige los campos minimos del caso;
5. el caso queda asociado a la atencion;
6. el profesional ve una bandera del caso;
7. auditoria y facturacion pueden consultar el estado.

## Lo que si hace el sistema

- unifica el contexto operativo del caso;
- deja trazabilidad basica;
- permite busqueda y consulta;
- prepara una historia/expediente inicial por paciente;
- permite avanzar hacia documentos, derivaciones y firma electronica;
- prepara terreno para integraciones futuras.

## Lo que no hace todavia

- validar cobertura con la ART en linea;
- emitir certificados complejos;
- automatizar decisiones clinicas;
- liquidar facturacion;
- orquestar todo el ciclo del siniestro.
- prometer conectividad con todas las ART antes de tener convenios o integraciones reales.

## Modelo base sugerido

Entidades minimas:

- `patients`
- `encounters`
- `incident_cases`
- `case_events`
- `case_documents`

`case_events` deja una auditoria liviana de cambios de estado y acciones relevantes.

## API minima sugerida

Prefijo:

`/api/v1`

Endpoints iniciales:

- `GET /health/live`
- `GET /health/ready`
- `POST /incident-cases`
- `GET /incident-cases`
- `GET /incident-cases/{id}`
- `PATCH /incident-cases/{id}`
- `POST /incident-cases/{id}/events`
- `GET /incident-cases/{id}/events`
- `POST /patients`
- `GET /patients/{id}`
- `POST /encounters`
- `GET /encounters/{id}`

## Criterios de exito del primer corte

- se puede crear un caso ART/incidente;
- el caso queda ligado a paciente y atencion;
- existe una forma simple de consultar su estado;
- cada cambio queda auditado;
- el modelo es lo bastante chico como para evolucionar sin reescritura.

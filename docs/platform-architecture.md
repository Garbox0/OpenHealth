# Arquitectura de plataforma

## Decision principal

No vamos a construir tres plataformas separadas. Vamos a construir una sola plataforma multirol con:

- un nucleo comun;
- una primera vista operativa para ART y backoffice;
- una vista medica posterior;
- una vista paciente posterior.

La razon es simple: el caso debe existir una sola vez y su estado debe ser una sola verdad.

## Orden de construccion

1. `core platform`
2. `backoffice ART`
3. `vista medica`
4. `vista paciente`

## Nucleo comun

El nucleo comun concentra el modelo y las reglas compartidas.

### Modulos base

- `patients`
- `practitioners`
- `organizations`
- `encounters`
- `incident_cases`
- `case_events`
- `case_documents`
- `users`
- `roles`
- `audit`

## Entidades principales

### Patient

Representa a la persona atendida.

Campos minimos:

- `id`
- `document_type`
- `document_number`
- `family_name`
- `given_names`
- `birth_date`
- `phone`
- `email`
- `created_at`
- `updated_at`

### Practitioner

Representa al medico o profesional interviniente.

Campos minimos:

- `id`
- `license_number`
- `family_name`
- `given_names`
- `specialty`
- `active`
- `created_at`
- `updated_at`

### Organization

Representa una institucion, empleador o ART, segun el tipo.

Campos minimos:

- `id`
- `type`
- `name`
- `tax_id`
- `active`
- `created_at`
- `updated_at`

Valores iniciales para `type`:

- `provider`
- `employer`
- `art`

### Encounter

Representa la atencion concreta.

Campos minimos:

- `id`
- `patient_id`
- `practitioner_id`
- `provider_organization_id`
- `started_at`
- `status`
- `chief_complaint`
- `created_at`
- `updated_at`

### IncidentCase

Es la entidad central del producto.

Campos minimos:

- `id`
- `patient_id`
- `encounter_id`
- `coverage_type`
- `incident_type`
- `incident_date`
- `employer_organization_id`
- `art_organization_id`
- `claim_number`
- `reported_by`
- `status`
- `current_owner_role`
- `notes`
- `created_at`
- `updated_at`

### CaseEvent

Deja trazabilidad operativa sin necesitar un motor complejo.

Campos minimos:

- `id`
- `incident_case_id`
- `event_type`
- `from_status`
- `to_status`
- `actor_user_id`
- `summary`
- `created_at`

### CaseDocument

Representa un adjunto o referencia documental ligada al caso.

Campos minimos:

- `id`
- `incident_case_id`
- `document_type`
- `storage_key`
- `file_name`
- `mime_type`
- `uploaded_by`
- `created_at`

### AuditEvent

Registro append-only de acciones sensibles.

Campos minimos:

- `id`
- `actor_user_id`
- `entity_type`
- `entity_id`
- `action`
- `result`
- `created_at`

## Vista 1: backoffice ART

Esta es la primera vista a construir.

### Usuarios

- admision;
- auditoria;
- facturacion;
- soporte operativo.

### Capacidades

- crear caso ART/incidente;
- asociarlo a paciente y atencion;
- completar datos administrativos minimos;
- cambiar estado;
- dejar comentarios operativos;
- adjuntar documentos;
- consultar historial del caso.

### Pantallas o secciones futuras

- bandeja de casos;
- detalle del caso;
- historial de eventos;
- documentos;
- busqueda por paciente, fecha, ART y estado.

## Vista 2: portal medico

Se construye despues del backoffice.

### Objetivo

Permitir que el profesional vea el contexto del caso sin meterse en la operatoria administrativa completa.

### Capacidades

- ver pacientes;
- ver atenciones;
- ver bandera ART/incidente;
- ver estado resumido del caso;
- consultar documentos permitidos;
- agregar notas clinicas si mas adelante se habilita.

## Vista 3: portal paciente

Se construye tercera.

### Objetivo

Dar visibilidad acotada y segura al propio paciente.

### Capacidades

- ver sus datos;
- ver sus atenciones;
- ver el estado general del caso;
- ver documentos habilitados;
- descargar constancias si corresponde.

## Roles iniciales

- `admin`
- `admission`
- `medical_auditor`
- `billing`
- `doctor`
- `patient`
- `support`

## Regla de permisos

No separar por plataforma. Separar por rol y recurso.

Ejemplo:

- `admission` crea y edita casos;
- `doctor` consulta casos asociados a sus atenciones;
- `patient` consulta solo sus propios datos;
- `billing` consulta estado y documentos administrativos;
- `support` ve estados operativos sin datos innecesarios.

## Workflow minimo del caso

Estados iniciales:

- `open`
- `in_review`
- `authorized`
- `rejected`
- `closed`

Transiciones minimas:

- `open -> in_review`
- `in_review -> authorized`
- `in_review -> rejected`
- `authorized -> closed`
- `rejected -> closed`

## API minima del core y backoffice

Prefijo:

`/api/v1`

Endpoints iniciales:

- `POST /patients`
- `GET /patients/{id}`
- `POST /encounters`
- `GET /encounters/{id}`
- `POST /incident-cases`
- `GET /incident-cases`
- `GET /incident-cases/{id}`
- `PATCH /incident-cases/{id}`
- `POST /incident-cases/{id}/events`
- `GET /incident-cases/{id}/events`
- `POST /incident-cases/{id}/documents`
- `GET /incident-cases/{id}/documents`

## Principio de integracion

Las integraciones no entran al dominio por la puerta principal. Se conectan como adaptadores alrededor del core.

Fuentes futuras:

- HIS o sistema de admision;
- portales o APIs de ART;
- documentos;
- importaciones CSV.

## Retencion clinica

La plataforma debe conservar historia clinica y documentacion asociada por al menos 10 anos desde la ultima actuacion registrada, conforme la base normativa argentina vigente.

Implicancias de arquitectura:

- no borrar fisicamente datos clinicos desde flujos operativos normales;
- preferir archivado logico;
- mantener auditoria de accesos y cambios;
- disenar backups y storage documental para recuperabilidad de largo plazo.

## Lo que postergamos a proposito

- interoperabilidad FHIR completa;
- integraciones en tiempo real con ART;
- mensajeria compleja;
- reglas de negocio por aseguradora;
- notificaciones omnicanal;
- frontend separado para cada actor.

## Definicion de exito del producto inicial

El producto inicial esta bien planteado si:

- existe una sola fuente de verdad para el caso;
- operacion puede crear y seguir un caso de punta a punta;
- el medico puede consultar el contexto sin duplicacion;
- el paciente puede sumarse despues sin redisenar el core.

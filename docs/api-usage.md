# Uso de la API

## Estado actual

La API ya permite operar el nucleo minimo del backoffice ART:

- pacientes;
- atenciones;
- casos ART/incidente;
- eventos del caso;
- documentos del caso.
- autenticacion real por bearer token con Keycloak OIDC local;
- permisos basicos por rol.

Base URL local:

`http://localhost:8000`

## Autenticacion

La API protege los endpoints funcionales con `Authorization: Bearer <token>`.

Base URL local:

`http://localhost:8000`

Proveedor de identidad local:

`http://localhost:8081/realms/openhealth`

Cliente OIDC de desarrollo:

- `openhealth-dev`

Usuarios demo:

- `admin`
- `administrative`
- `doctor`

Esos usuarios demo se preparan automaticamente cuando levantas `docker compose`. Las contrasenas reales no se versionan: en la Raspberry quedan en `.env.tunnel`; en local se pueden definir con `OPENHEALTH_USER_*_PASSWORD`.

### Obtener sesion

El flujo recomendado es login web OIDC con Authorization Code + PKCE desde los portales.
El `password grant` queda deshabilitado en ambientes endurecidos para reducir ataques de fuerza bruta.

Respuesta esperada:

- `access_token`
- `refresh_token`
- `expires_in`

### Usar el token

```http
Authorization: Bearer ACCESS_TOKEN
```

Roles soportados por la API:

- `admin`
- `administrative`
- `doctor`

## Endpoints de salud

- `GET /`
- `GET /health/live`
- `GET /health/ready`
- `GET /api/v1/me`

## Flujo minimo de uso

### 1. Crear paciente

```http
POST /api/v1/patients
Content-Type: application/json
Authorization: Bearer ACCESS_TOKEN
```

```json
{
  "family_name": "Perez",
  "given_names": "Ana",
  "document_type": "dni",
  "document_number": "12345678"
}
```

### 2. Crear atencion

```http
POST /api/v1/encounters
Content-Type: application/json
Authorization: Bearer ACCESS_TOKEN
```

```json
{
  "patient_id": "UUID_DEL_PACIENTE",
  "status": "open",
  "practitioner_name": "Dr. Test"
}
```

Respuesta relevante:

- `has_incident_case`: indica si esa atencion ya tiene al menos un caso asociado.

### 3. Crear caso ART/incidente

```http
POST /api/v1/incident-cases
Content-Type: application/json
Authorization: Bearer ACCESS_TOKEN
```

```json
{
  "patient_id": "UUID_DEL_PACIENTE",
  "encounter_id": "UUID_DE_LA_ATENCION",
  "coverage_type": "art",
  "incident_type": "work_accident",
  "incident_date": "2026-07-20",
  "art_name": "ART Demo",
  "reported_by": "recepcion",
  "notes": "Ingreso por accidente laboral"
}
```

## Reglas operativas actuales

- si `coverage_type` es `art`, `art_name` es obligatorio;
- la `encounter` debe pertenecer al `patient` informado;
- los estados del caso tienen transiciones controladas;
- cada creacion de caso genera un `case_created`;
- cada cambio valido de estado genera un `status_changed`.

## Estados soportados

- `open`
- `in_review`
- `authorized`
- `rejected`
- `closed`

## Transiciones validas

- `open -> in_review`
- `in_review -> authorized`
- `in_review -> rejected`
- `authorized -> closed`
- `rejected -> closed`

## Busqueda de casos

`GET /api/v1/incident-cases`

Filtros soportados:

- `patient_id`
- `encounter_id`
- `status`
- `coverage_type`
- `incident_type`
- `incident_date_from`
- `incident_date_to`

Ejemplo:

```http
GET /api/v1/incident-cases?patient_id=UUID&status=in_review&incident_date_from=2026-07-01&incident_date_to=2026-07-31
```

## Eventos del caso

### Crear evento manual

```http
POST /api/v1/incident-cases/{id}/events
Content-Type: application/json
Authorization: Bearer ACCESS_TOKEN
```

```json
{
  "event_type": "note_added",
  "summary": "Se solicito documentacion complementaria",
  "actor_id": "recepcion"
}
```

### Listar eventos

`GET /api/v1/incident-cases/{id}/events`

## Documentos del caso

En esta etapa solo se guardan metadatos del documento.

### Crear documento

```http
POST /api/v1/incident-cases/{id}/documents
Content-Type: application/json
Authorization: Bearer ACCESS_TOKEN
```

```json
{
  "document_type": "denuncia",
  "storage_key": "cases/uuid/denuncia.pdf",
  "file_name": "denuncia.pdf",
  "mime_type": "application/pdf",
  "uploaded_by": "recepcion"
}
```

## Limitaciones actuales

- la autenticacion actual usa un realm local de Keycloak pensado para desarrollo y demo;
- no hay tenancy;
- no hay upload binario real de archivos;
- no hay portal web todavia.

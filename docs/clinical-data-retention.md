# Retencion de datos clinicos

## Regla Argentina base

Para Argentina, la Ley 26.529 de Derechos del Paciente, Historia Clinica y Consentimiento Informado establece la guarda de la historia clinica por un plazo minimo de 10 anos. El plazo se computa desde la ultima actuacion registrada en la historia clinica.

La reglamentacion tambien exige que la historia clinica informatizada preserve integridad, autenticidad, inalterabilidad, perdurabilidad y recuperabilidad.

Fuentes:

- InfoLeg, Ley 26.529: https://servicios.infoleg.gob.ar/infolegInternet/anexos/160000-164999/160432/texact.htm
- Decreto reglamentario 1089/2012: https://servicios.infoleg.gob.ar/infolegInternet/anexos/195000-199999/199296/norma.htm

## Decision para OpenHealth Bridge

No vamos a borrar datos clinicos automaticamente al cumplir 10 anos.

La politica inicial sera:

- conservar historia clinica, eventos, documentos y auditoria por al menos 10 anos desde la ultima actuacion;
- impedir borrado fisico desde la UI operativa;
- usar cierre/archivo logico para expedientes inactivos;
- mantener backups restaurables durante la ventana exigida;
- registrar accesos y cambios sensibles.

## Implicancias tecnicas

### Datos

Entidades alcanzadas por retencion:

- pacientes;
- atenciones;
- casos/incidentes;
- eventos clinicos y administrativos;
- documentos adjuntos;
- firmas simples o digitales;
- auditoria de accesos y modificaciones.

### Storage

Los documentos deben guardarse por tenant y caso:

```txt
tenant/{tenant_slug}/patients/{patient_id}/cases/{case_id}/{document_id}-{file_name}
```

### Backups

Antes de vender a clinicas reales necesitamos:

- backups cifrados;
- restore probado;
- retencion de backups alineada a la politica clinica;
- copia fuera del host principal;
- monitoreo de fallas de backup.

### Borrado

El borrado fisico de datos clinicos debe quedar bloqueado por defecto.

Si se implementa una accion de eliminacion, debe ser:

- excepcional;
- auditada;
- limitada a roles tecnicos autorizados;
- compatible con obligaciones legales y contractuales.

## Pendientes antes de produccion real

- agregar `archived_at` y `retention_until` donde corresponda;
- reemplazar deletes clinicos por archivado logico;
- agregar auditoria de lectura de expedientes;
- implementar almacenamiento real de archivos con versionado o mecanismo no reescribible;
- revisar con abogado/compliance si aplica normativa provincial o contractual adicional por cliente.

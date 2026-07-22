# Branding por cliente

OpenHealth Bridge mantiene un estilo unico de producto, pero cada cliente puede tener identidad propia.

La identidad base se define en [Identidad visual](brand-guidelines.md).

## Regla de producto

- La estructura, navegacion, componentes y seguridad son comunes.
- Cada tenant puede definir nombre, monograma, color acento y logo.
- La marca del cliente se ve en el acceso institucional y puede extenderse a headers internos.

## Configuracion actual

Central Salud:

- hostname: `centralsalud.aerosftp.com`
- nombre: `Central Salud`
- monograma: `CS`
- acento: `#006d77`
- logo actual: `site/assets/tenants/central-salud-mark.svg`
- firma de plataforma: `site/assets/openhealth-wordmark.svg`
- theme login: `docker/keycloak/themes/openhealth`

## Implementacion actual

El branding vive en `site/shared/tenant.js`:

```js
brand: {
  accent: "#006d77",
  mark: "CS",
  logoUrl: "/assets/tenants/central-salud-mark.svg",
}
```

Cuando el cliente entregue logo:

1. guardar el archivo en una ruta publica del tenant, por ejemplo `site/assets/tenants/centralsalud/logo.svg`;
2. definir `logoUrl: "/assets/tenants/centralsalud/logo.svg"`;
3. mantener `mark` como fallback si el logo no carga.

## Pendiente recomendado

Mover esta configuracion a backend/base de datos cuando haya mas de 2 clientes, para que soporte pueda actualizar marca sin redeploy.

## Login Keycloak

El login usa un theme propio para no romper OIDC/PKCE ni manejar passwords en nuestra app.

Para adaptar el login a otro cliente hoy:

1. cambiar `displayName`/`displayNameHtml` del realm o cliente visible;
2. ajustar `--tenant-mark-text` en `docker/keycloak/themes/openhealth/login/resources/css/openhealth.css`;
3. si hay logo real del cliente, reemplazar el monograma por un asset del theme;
4. mantener siempre visible la firma de plataforma OpenHealth.

Cuando haya varios clientes reales conviene mover esta marca a una configuracion central y generar theme/assets por tenant.

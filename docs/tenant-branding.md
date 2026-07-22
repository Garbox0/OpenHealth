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

const TENANTS = [
  {
    id: "centralsalud",
    kind: "clinic",
    name: "Central Salud",
    shortName: "Central Salud",
    hostnames: ["centralsalud.aerosftp.com"],
    supportEmail: "it@centralsalud.demo",
    loginLabel: "Ingresar al espacio de Central Salud",
    brand: {
      accent: "#006d77",
      mark: "CS",
      logoUrl: "/assets/tenants/central-salud-mark.svg",
    },
    landing: {
      eyebrow: "Acceso institucional",
      title: "Central Salud",
      copy:
        "Plataforma interna para profesionales, administracion y soporte IT. Inicia sesion y entra directo a tu area de trabajo.",
      status:
        "SSO activo: medicos, administrativos e IT entran por el mismo lugar y operan con permisos separados.",
    },
  },
];

const DEFAULT_TENANT = {
  id: "openhealth",
  kind: "platform",
  name: "OpenHealth Bridge",
  shortName: "OpenHealth",
  hostnames: ["www.aerosftp.com", "aerosftp.com", "localhost", "127.0.0.1"],
  supportEmail: "admin@aerosftp.com",
  loginLabel: "Entrar a la plataforma",
  brand: {
    accent: "#006d77",
    mark: "OH",
    logoUrl: null,
  },
  landing: {
    eyebrow: "OpenHealth Bridge",
    title: "Software medico laboral para operar sin perseguir papeles.",
    copy:
      "OpenHealth Bridge unifica el trabajo de medicos, administrativos e IT con expediente por paciente, documentos y permisos por rol.",
    status: "Estado actual: plataforma real online con backoffice, portal medico y modulo IT en marcha.",
  },
};

export function getTenantContext(hostname = window.location.hostname) {
  const normalized = hostname.toLowerCase();
  return TENANTS.find((tenant) => tenant.hostnames.includes(normalized)) || DEFAULT_TENANT;
}

export function getTenantModuleCards(tenant) {
  const employeeCopy =
    tenant.kind === "clinic"
      ? `Acceso interno para los equipos de ${tenant.shortName}.`
      : "Bandeja operativa real para admision, auditoria y seguimiento.";

  return [
    {
      href: "/backoffice/",
      roles: ["admin", "admission", "medical_auditor", "billing", "support"],
      title: "Backoffice ART",
      description: employeeCopy,
      features: ["admision", "casos ART", "auditoria", "seguimiento"],
    },
    {
      href: "/medicos/",
      roles: ["admin", "doctor"],
      title: "Portal medico",
      description: "Vista clinica real para revisar casos, contexto del paciente y notas del equipo.",
      features: ["pacientes", "expediente", "documentos", "derivaciones"],
    },
    {
      href: "/seguridad/",
      roles: ["admin"],
      title: "Seguridad e IT",
      description: "Panel propio para usuarios, grupos y permisos dentro de la plataforma.",
      features: ["usuarios", "roles", "grupos", "permisos"],
    },
  ];
}

export function getPlatformCards() {
  return [
    ...getTenantModuleCards(DEFAULT_TENANT),
    {
      href: "https://api.aerosftp.com/docs",
      title: "API y Swagger",
      description: "Documentacion viva para probar endpoints reales.",
      features: ["health", "contratos", "pruebas"],
    },
    {
      href: "https://auth.aerosftp.com/admin",
      title: "Motor de identidad",
      description:
        "Keycloak queda como backend de acceso mientras migramos toda la gestion a la UI propia.",
      features: ["OIDC", "PKCE", "SSO"],
    },
  ];
}

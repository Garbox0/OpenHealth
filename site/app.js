import { createPlatformSession, escapeHtml, humanizeError } from "/shared/platform.js";
import { getTenantContext } from "/shared/tenant.js";

const tenant = getTenantContext();
const session = createPlatformSession({ moduleId: "home" });

const elements = {
  eyebrow: document.querySelector("#landing-eyebrow"),
  loginButton: document.querySelector("#login-button"),
  logoutButton: document.querySelector("#logout-button"),
  copy: document.querySelector("#landing-copy"),
  roleList: document.querySelector("#role-list"),
  sessionPanel: document.querySelector("#session-panel"),
  status: document.querySelector("#landing-status"),
  title: document.querySelector("#landing-title"),
  tenantLogo: document.querySelector("#tenant-logo"),
  userName: document.querySelector("#user-name"),
};

elements.loginButton.addEventListener("click", () => session.startLogin());
elements.logoutButton.addEventListener("click", () => session.logout());

bootstrap().catch((error) => {
  console.error(error);
  renderSignedOut(`No pude iniciar la sesion: ${humanizeError(error)}`);
});

async function bootstrap() {
  document.title = tenant.kind === "clinic" ? `${tenant.shortName} | OpenHealth Bridge` : "OpenHealth Bridge";
  elements.eyebrow.textContent = tenant.landing.eyebrow;
  elements.title.textContent = tenant.landing.title;
  elements.copy.textContent = tenant.landing.copy;
  elements.status.textContent = tenant.landing.status;
  applyTenantBrand();

  await session.bootstrap();
  if (!session.isAuthenticated()) {
    renderSignedOut("Inicia sesion con tu usuario institucional. Te llevamos automaticamente al area que corresponde a tu rol.");
    return;
  }

  routeAuthenticatedUser();
}

function applyTenantBrand() {
  const brand = tenant.brand || {};
  if (brand.accent) {
    document.documentElement.style.setProperty("--brand", brand.accent);
  }
  if (brand.logoUrl) {
    elements.tenantLogo.innerHTML = `<img src="${escapeHtml(brand.logoUrl)}" alt="">`;
    return;
  }
  elements.tenantLogo.textContent = brand.mark || tenant.shortName.slice(0, 2).toUpperCase();
}

function renderSignedOut(message) {
  elements.loginButton.classList.remove("hidden");
  elements.logoutButton.classList.add("hidden");
  elements.sessionPanel.classList.add("hidden");
  elements.status.textContent = message;
}

function routeAuthenticatedUser() {
  const actor = session.state.actor;
  const target = targetPathForRoles(actor.roles);

  elements.loginButton.classList.add("hidden");
  elements.logoutButton.classList.remove("hidden");
  elements.sessionPanel.classList.remove("hidden");
  elements.userName.textContent = `${actor.username} | ${actor.tenant_name}`;
  elements.roleList.innerHTML = actor.roles.map((role) => `<span class="pill">${escapeHtml(humanizeRole(role))}</span>`).join("");

  if (!target) {
    elements.status.textContent = "Tu usuario no tiene un modulo asignado. Pedile a IT que revise tus permisos.";
    return;
  }

  elements.status.textContent = "Sesion validada. Redirigiendo a tu area de trabajo...";
  window.location.replace(target);
}

function targetPathForRoles(roles) {
  if (roles.includes("admin")) {
    return "/seguridad/";
  }
  if (roles.includes("doctor")) {
    return "/medicos/";
  }
  if (roles.some((role) => ["admission", "medical_auditor", "billing", "support"].includes(role))) {
    return "/backoffice/";
  }
  return null;
}

function humanizeRole(role) {
  const labels = {
    admin: "IT administrador",
    admission: "Admision",
    billing: "Facturacion",
    doctor: "Medico",
    medical_auditor: "Auditoria medica",
    patient: "Paciente",
    support: "Soporte",
  };
  return labels[role] || role;
}

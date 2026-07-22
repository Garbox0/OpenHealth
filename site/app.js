import { createPlatformSession, escapeHtml, humanizeError } from "/shared/platform.js";
import { getTenantContext, getTenantModuleCards } from "/shared/tenant.js";

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
  workspaceGrid: document.querySelector("#workspace-grid"),
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
    renderSignedOut("Inicia sesion con tu usuario institucional. Despues ves solo las secciones habilitadas para tu rol.");
    return;
  }

  renderDashboard();
}

function applyTenantBrand() {
  document.documentElement.dataset.tenant = tenant.id;
  const brand = tenant.brand || {};
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
  elements.workspaceGrid.innerHTML = "";
  elements.status.textContent = message;
}

function renderDashboard() {
  const actor = session.state.actor;
  const visibleCards = getTenantModuleCards(tenant).filter((card) =>
    actor.roles.some((role) => card.roles.includes(role)),
  );

  elements.loginButton.classList.add("hidden");
  elements.logoutButton.classList.remove("hidden");
  elements.sessionPanel.classList.remove("hidden");
  elements.userName.textContent = actor.username;
  elements.roleList.innerHTML = actor.roles.map((role) => `<span class="pill">${escapeHtml(humanizeRole(role))}</span>`).join("");

  if (visibleCards.length === 0) {
    elements.status.textContent = "Tu usuario no tiene un modulo asignado. Pedile a IT que revise tus permisos.";
    elements.workspaceGrid.innerHTML = "";
    return;
  }

  elements.status.textContent = "Sesion segura activa. Elegi una seccion para trabajar.";
  elements.workspaceGrid.innerHTML = visibleCards.map(renderWorkspaceCard).join("");
}

function renderWorkspaceCard(card) {
  const roleText = card.roles.map(humanizeRole).join(", ");
  return `
    <a class="workspace-card" href="${escapeHtml(card.href)}">
      <small>${escapeHtml(roleText)}</small>
      <strong>${escapeHtml(card.title)}</strong>
      <span>${escapeHtml(card.description)}</span>
      <span>${escapeHtml(card.features.join(" / "))}</span>
    </a>
  `;
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

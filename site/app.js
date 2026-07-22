import { createPlatformSession, escapeHtml, humanizeError } from "/shared/platform.js?v=20260722-three-roles";
import { getTenantContext, getTenantDefaultModuleHref } from "/shared/tenant.js?v=20260722-three-roles";

const tenant = getTenantContext();
const session = createPlatformSession({ moduleId: "home" });

const elements = {
  eyebrow: document.querySelector("#landing-eyebrow"),
  loginButton: document.querySelector("#login-button"),
  logoutButton: document.querySelector("#logout-button"),
  copy: document.querySelector("#landing-copy"),
  marketingPanel: document.querySelector("#marketing-panel"),
  roleList: document.querySelector("#role-list"),
  sessionPanel: document.querySelector("#session-panel"),
  signatureLabel: document.querySelector("#signature-label"),
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
  elements.copy.textContent = tenant.kind === "clinic" ? "" : tenant.landing.copy;
  elements.status.textContent = "";
  elements.signatureLabel.textContent = tenant.kind === "clinic" ? "Powered by" : "Producto";
  applyTenantBrand();

  await session.bootstrap();
  if (!session.isAuthenticated()) {
    renderSignedOut();
    return;
  }

  const workspaceHref = getTenantDefaultModuleHref(session.state.actor.roles);
  if (workspaceHref) {
    window.location.replace(workspaceHref);
    return;
  }

  renderNoWorkspace();
}

function applyTenantBrand() {
  document.documentElement.dataset.tenant = tenant.id;
  document.documentElement.dataset.tenantKind = tenant.kind;
  const brand = tenant.brand || {};
  if (brand.logoUrl) {
    elements.tenantLogo.innerHTML = `<img src="${escapeHtml(brand.logoUrl)}" alt="">`;
    return;
  }
  elements.tenantLogo.textContent = brand.mark || tenant.shortName.slice(0, 2).toUpperCase();
}

function renderSignedOut() {
  elements.loginButton.classList.remove("hidden");
  elements.logoutButton.classList.add("hidden");
  elements.marketingPanel.classList.toggle("hidden", tenant.kind !== "platform");
  elements.sessionPanel.classList.add("hidden");
  elements.status.classList.add("hidden");
  elements.workspaceGrid.innerHTML = "";
  elements.status.textContent = "";
}

function renderNoWorkspace() {
  const actor = session.state.actor;

  elements.loginButton.classList.add("hidden");
  elements.logoutButton.classList.remove("hidden");
  elements.marketingPanel.classList.add("hidden");
  elements.sessionPanel.classList.remove("hidden");
  elements.userName.textContent = actor.username;
  elements.roleList.innerHTML = actor.roles.map((role) => `<span class="pill">${escapeHtml(humanizeRole(role))}</span>`).join("");

  elements.status.classList.remove("hidden");
  elements.status.textContent = "Tu usuario no tiene un espacio de trabajo asignado. Pedi a IT que revise tus permisos.";
  elements.workspaceGrid.innerHTML = "";
}

function humanizeRole(role) {
  const labels = {
    admin: "IT administrador",
    administrative: "Administrativo",
    doctor: "Medico",
    patient: "Paciente",
  };
  return labels[role] || role;
}

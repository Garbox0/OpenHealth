import { createPlatformSession, escapeHtml, humanizeError, optionalValue } from "/shared/platform.js";

const session = createPlatformSession({ moduleId: "seguridad" });

const state = {
  groups: [],
  users: [],
};

const elements = {
  appShell: document.querySelector("#app-shell"),
  authCopy: document.querySelector("#auth-copy"),
  authPanel: document.querySelector("#auth-panel"),
  createFeedback: document.querySelector("#create-feedback"),
  createGroupOptions: document.querySelector("#create-group-options"),
  createUserForm: document.querySelector("#create-user-form"),
  groupList: document.querySelector("#group-list"),
  heroLoginButton: document.querySelector("#hero-login-button"),
  loginButton: document.querySelector("#login-button"),
  logoutButton: document.querySelector("#logout-button"),
  moduleNav: document.querySelector("#module-nav"),
  refreshUsersButton: document.querySelector("#refresh-users-button"),
  roleList: document.querySelector("#role-list"),
  tenantBadge: document.querySelector("#tenant-badge"),
  tenantName: document.querySelector("#tenant-name"),
  tenantSupport: document.querySelector("#tenant-support"),
  userList: document.querySelector("#user-list"),
  userMeta: document.querySelector("#user-meta"),
  userName: document.querySelector("#user-name"),
  userSearchForm: document.querySelector("#user-search-form"),
};

bootstrap().catch((error) => {
  console.error(error);
  renderSignedOut(humanizeError(error));
});

elements.createUserForm.addEventListener("submit", handleCreateUser);
elements.heroLoginButton.addEventListener("click", () => session.startLogin());
elements.loginButton.addEventListener("click", () => session.startLogin());
elements.logoutButton.addEventListener("click", () => session.logout());
elements.refreshUsersButton.addEventListener("click", () => loadUsers());
elements.userSearchForm.addEventListener("submit", handleSearchUsers);

async function bootstrap() {
  await session.bootstrap();

  if (!session.isAuthenticated()) {
    window.location.replace("/");
    return;
  }

  if (!session.hasRole("admin")) {
    window.location.replace("/");
    return;
  }

  renderSignedIn();
  await loadGroups();
  await loadUsers();
}

async function loadGroups() {
  state.groups = await session.apiFetch("/security/groups");
  renderCreateGroupOptions();
  renderGroupList();
}

async function loadUsers(search = "") {
  elements.userList.innerHTML = renderEmpty("Cargando usuarios...");
  const path = search ? `/security/users?search=${encodeURIComponent(search)}` : "/security/users";
  state.users = await session.apiFetch(path);
  renderUserList();
}

async function handleSearchUsers(event) {
  event.preventDefault();
  const form = new FormData(elements.userSearchForm);
  await loadUsers(optionalValue(form.get("search")) || "");
}

async function handleCreateUser(event) {
  event.preventDefault();
  const form = new FormData(elements.createUserForm);
  setFeedback(elements.createFeedback, "Creando usuario...");

  try {
    await session.apiFetch("/security/users", {
      method: "POST",
      body: JSON.stringify({
        email: optionalValue(form.get("email")),
        enabled: form.get("enabled") === "on",
        first_name: optionalValue(form.get("first_name")),
        group_names: selectedGroupNames(elements.createUserForm),
        last_name: optionalValue(form.get("last_name")),
        password: form.get("password"),
        username: form.get("username"),
      }),
    });
    elements.createUserForm.reset();
    renderCreateGroupOptions();
    setFeedback(elements.createFeedback, "Usuario creado.", true);
    await loadUsers();
    await loadGroups();
  } catch (error) {
    setFeedback(elements.createFeedback, humanizeError(error), false);
  }
}

async function handleSaveUser(button) {
  const userId = button.dataset.userId;
  const container = button.closest(".user-card");
  const enabled = container.querySelector("[data-field='enabled']").checked;
  const password = optionalValue(container.querySelector("[data-field='password']").value);
  const groupNames = selectedGroupNames(container);
  const feedback = container.querySelector(".feedback");

  setFeedback(feedback, "Guardando...");

  try {
    await session.apiFetch(`/security/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({
        enabled,
        group_names: groupNames,
        password,
      }),
    });
    setFeedback(feedback, "Usuario actualizado.", true);
    await loadUsers();
    await loadGroups();
  } catch (error) {
    setFeedback(feedback, humanizeError(error), false);
  }
}

function renderSignedOut(message) {
  state.groups = [];
  state.users = [];
  elements.appShell.classList.add("hidden");
  elements.authPanel.classList.remove("hidden");
  elements.heroLoginButton.classList.remove("hidden");
  showAuthMessage(message);
  session.renderSignedOutChrome(elements);
}

function renderSignedIn() {
  elements.appShell.classList.remove("hidden");
  elements.authPanel.classList.add("hidden");
  elements.heroLoginButton.classList.add("hidden");
  session.renderSignedInChrome(elements);
}

function renderCreateGroupOptions() {
  elements.createGroupOptions.innerHTML = state.groups
    .map(
      (group) => `
        <label class="pill">
          <input type="checkbox" name="group_names" value="${escapeHtml(group.name)}">
          <span>${escapeHtml(group.name)}</span>
        </label>
      `,
    )
    .join("");
}

function renderGroupList() {
  elements.groupList.innerHTML = state.groups
    .map(
      (group) => `
        <article class="case-card">
          <header>
            <strong>${escapeHtml(group.name)}</strong>
            <span class="pill">${group.member_count} usuarios</span>
          </header>
          <p><strong>Path:</strong> ${escapeHtml(group.path)}</p>
          <p><strong>Roles:</strong> ${escapeHtml(group.roles.join(" | ") || "sin roles")}</p>
        </article>
      `,
    )
    .join("");
}

function renderUserList() {
  if (state.users.length === 0) {
    elements.userList.innerHTML = renderEmpty("No encontre usuarios.");
    return;
  }

  elements.userList.innerHTML = state.users
    .map(
      (user) => `
        <article class="case-card user-card">
          <header>
            <strong>${escapeHtml(user.username)}</strong>
            <span class="pill">${user.enabled ? "activo" : "bloqueado"}</span>
          </header>
          <p><strong>Nombre:</strong> ${escapeHtml([user.first_name, user.last_name].filter(Boolean).join(" ") || "-")}</p>
          <p><strong>Email:</strong> ${escapeHtml(user.email || "-")}</p>
          <p><strong>Roles efectivos:</strong> ${escapeHtml(user.roles.join(" | ") || "-")}</p>
          <div class="stack-form">
            <label>
              <span>Activo</span>
              <input data-field="enabled" type="checkbox" ${user.enabled ? "checked" : ""}>
            </label>
            <fieldset class="stack-form">
              <legend>Grupos</legend>
              <div class="pill-row">
                ${state.groups
                  .map(
                    (group) => `
                      <label class="pill">
                        <input
                          type="checkbox"
                          name="group_names"
                          value="${escapeHtml(group.name)}"
                          ${user.groups.includes(group.name) ? "checked" : ""}
                        >
                        <span>${escapeHtml(group.name)}</span>
                      </label>
                    `,
                  )
                  .join("")}
              </div>
            </fieldset>
            <label>
              <span>Nueva password</span>
              <input data-field="password" type="password" placeholder="Dejar vacio para no cambiar">
            </label>
            <div class="form-actions">
              <button class="secondary save-user-button" data-user-id="${user.id}" type="button">Guardar cambios</button>
              <p class="feedback"></p>
            </div>
          </div>
        </article>
      `,
    )
    .join("");

  for (const button of elements.userList.querySelectorAll(".save-user-button")) {
    button.addEventListener("click", () => handleSaveUser(button));
  }
}

function selectedGroupNames(container) {
  return Array.from(container.querySelectorAll("input[name='group_names']:checked")).map((input) => input.value);
}

function setFeedback(element, message, success = null) {
  element.textContent = message;
  element.classList.remove("error", "success");
  if (success === true) {
    element.classList.add("success");
  }
  if (success === false) {
    element.classList.add("error");
  }
}

function showAuthMessage(message) {
  elements.authCopy.textContent = message;
}

function renderEmpty(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

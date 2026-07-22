import { createPlatformSession, escapeHtml, humanizeError, optionalValue } from "/shared/platform.js";

const session = createPlatformSession({ moduleId: "backoffice" });

const state = {
  selectedCaseId: null,
  selectedCase: null,
};

const elements = {
  appShell: document.querySelector("#app-shell"),
  authCopy: document.querySelector("#auth-copy"),
  authPanel: document.querySelector("#auth-panel"),
  caseList: document.querySelector("#case-list"),
  createFeedback: document.querySelector("#create-feedback"),
  createForm: document.querySelector("#case-create-form"),
  createPanel: document.querySelector("#create-panel"),
  detailPanel: document.querySelector("#case-detail-panel"),
  detailSummary: document.querySelector("#detail-summary"),
  detailTitle: document.querySelector("#detail-title"),
  documentList: document.querySelector("#document-list"),
  eventList: document.querySelector("#event-list"),
  filtersForm: document.querySelector("#filters-form"),
  heroLoginButton: document.querySelector("#hero-login-button"),
  loginButton: document.querySelector("#login-button"),
  logoutButton: document.querySelector("#logout-button"),
  moduleNav: document.querySelector("#module-nav"),
  noteFeedback: document.querySelector("#note-feedback"),
  noteForm: document.querySelector("#case-note-form"),
  refreshCasesButton: document.querySelector("#refresh-cases-button"),
  roleList: document.querySelector("#role-list"),
  statusFeedback: document.querySelector("#status-feedback"),
  statusForm: document.querySelector("#case-status-form"),
  tenantBadge: document.querySelector("#tenant-badge"),
  tenantName: document.querySelector("#tenant-name"),
  tenantSupport: document.querySelector("#tenant-support"),
  userMeta: document.querySelector("#user-meta"),
  userName: document.querySelector("#user-name"),
};

bootstrap().catch((error) => {
  console.error(error);
  renderSignedOut(humanizeError(error));
});

elements.createForm.addEventListener("submit", handleCreateCase);
elements.filtersForm.addEventListener("submit", handleFilterSubmit);
elements.heroLoginButton.addEventListener("click", () => session.startLogin());
elements.loginButton.addEventListener("click", () => session.startLogin());
elements.logoutButton.addEventListener("click", () => session.logout());
elements.noteForm.addEventListener("submit", handleAddNote);
elements.refreshCasesButton.addEventListener("click", () => loadCases());
elements.statusForm.addEventListener("submit", handleStatusUpdate);

async function bootstrap() {
  await session.bootstrap();

  if (!session.isAuthenticated()) {
    renderSignedOut("Entramos una sola vez con usuarios reales del realm openhealth.");
    return;
  }

  if (!canAccessModule()) {
    renderAccessDenied();
    return;
  }

  renderSignedIn();
  await loadCases();
}

async function loadCases() {
  elements.caseList.innerHTML = renderEmpty("Cargando casos...");

  const filters = new FormData(elements.filtersForm);
  const params = new URLSearchParams();

  for (const [key, value] of filters.entries()) {
    if (value) {
      params.set(key, value);
    }
  }

  const cases = await session.apiFetch(`/incident-cases${params.size ? `?${params}` : ""}`);
  renderCaseList(cases);

  if (state.selectedCaseId) {
    const stillExists = cases.find((item) => item.id === state.selectedCaseId);
    if (stillExists) {
      await loadCaseDetail(state.selectedCaseId);
      return;
    }
  }

  if (cases.length > 0) {
    await loadCaseDetail(cases[0].id);
    return;
  }

  state.selectedCaseId = null;
  state.selectedCase = null;
  elements.detailPanel.classList.add("hidden");
}

async function loadCaseDetail(caseId) {
  state.selectedCaseId = caseId;
  const incidentCase = await session.apiFetch(`/incident-cases/${caseId}`);
  const patient = await session.apiFetch(`/patients/${incidentCase.patient_id}`);
  const encounter = await session.apiFetch(`/encounters/${incidentCase.encounter_id}`);
  const events = await session.apiFetch(`/incident-cases/${caseId}/events`);
  const documents = await session.apiFetch(`/incident-cases/${caseId}/documents`);

  state.selectedCase = { documents, encounter, events, incidentCase, patient };
  renderCaseDetail();
  highlightSelectedCase();
}

async function handleCreateCase(event) {
  event.preventDefault();
  setFeedback(elements.createFeedback, "Creando paciente, atencion y caso...");

  try {
    const form = new FormData(elements.createForm);
    const patient = await session.apiFetch("/patients", {
      method: "POST",
      body: JSON.stringify({
        family_name: form.get("family_name"),
        given_names: form.get("given_names"),
        document_type: optionalValue(form.get("document_type")),
        document_number: optionalValue(form.get("document_number")),
        phone: optionalValue(form.get("phone")),
        email: optionalValue(form.get("email")),
      }),
    });

    const encounter = await session.apiFetch("/encounters", {
      method: "POST",
      body: JSON.stringify({
        patient_id: patient.id,
        practitioner_name: optionalValue(form.get("practitioner_name")),
        provider_name: optionalValue(form.get("provider_name")),
        chief_complaint: optionalValue(form.get("chief_complaint")),
      }),
    });

    const incidentCase = await session.apiFetch("/incident-cases", {
      method: "POST",
      body: JSON.stringify({
        patient_id: patient.id,
        encounter_id: encounter.id,
        coverage_type: form.get("coverage_type"),
        incident_type: form.get("incident_type"),
        incident_date: form.get("incident_date"),
        art_name: optionalValue(form.get("art_name")),
        employer_name: optionalValue(form.get("employer_name")),
        reported_by: optionalValue(form.get("reported_by")),
        current_owner_role: optionalValue(form.get("current_owner_role")),
        notes: optionalValue(form.get("notes")),
      }),
    });

    elements.createForm.reset();
    elements.createForm.querySelector("[name='coverage_type']").value = "art";
    elements.createForm.querySelector("[name='incident_type']").value = "work_accident";
    elements.createForm.querySelector("[name='current_owner_role']").value = "admission";
    elements.createForm.querySelector("[name='document_type']").value = "dni";
    elements.createForm.querySelector("[name='incident_date']").value = todayIso();
    setFeedback(elements.createFeedback, `Caso ${incidentCase.id.slice(0, 8)} creado correctamente.`, true);
    await loadCases();
    await loadCaseDetail(incidentCase.id);
  } catch (error) {
    setFeedback(elements.createFeedback, humanizeError(error), false);
  }
}

async function handleFilterSubmit(event) {
  event.preventDefault();
  await loadCases();
}

async function handleStatusUpdate(event) {
  event.preventDefault();
  if (!state.selectedCaseId) {
    return;
  }

  const form = new FormData(elements.statusForm);
  setFeedback(elements.statusFeedback, "Actualizando caso...");

  try {
    await session.apiFetch(`/incident-cases/${state.selectedCaseId}`, {
      method: "PATCH",
      body: JSON.stringify({
        current_owner_role: form.get("current_owner_role"),
        status: form.get("status"),
      }),
    });
    setFeedback(elements.statusFeedback, "Caso actualizado.", true);
    await loadCases();
  } catch (error) {
    setFeedback(elements.statusFeedback, humanizeError(error), false);
  }
}

async function handleAddNote(event) {
  event.preventDefault();
  if (!state.selectedCaseId) {
    return;
  }

  const form = new FormData(elements.noteForm);
  setFeedback(elements.noteFeedback, "Registrando evento...");

  try {
    await session.apiFetch(`/incident-cases/${state.selectedCaseId}/events`, {
      method: "POST",
      body: JSON.stringify({
        event_type: "note_added",
        summary: form.get("summary"),
      }),
    });
    elements.noteForm.reset();
    setFeedback(elements.noteFeedback, "Evento registrado.", true);
    await loadCaseDetail(state.selectedCaseId);
  } catch (error) {
    setFeedback(elements.noteFeedback, humanizeError(error), false);
  }
}

function renderSignedOut(message) {
  state.selectedCase = null;
  state.selectedCaseId = null;
  elements.appShell.classList.add("hidden");
  elements.authPanel.classList.remove("hidden");
  elements.heroLoginButton.classList.remove("hidden");
  showAuthMessage(message);
  session.renderSignedOutChrome(elements);
}

function renderAccessDenied() {
  elements.appShell.classList.add("hidden");
  elements.authPanel.classList.remove("hidden");
  elements.heroLoginButton.classList.add("hidden");
  showAuthMessage("Tu sesion esta activa, pero este modulo no esta habilitado para tu rol. Usa la barra superior para entrar en una seccion permitida.");
  session.renderSignedInChrome(elements);
}

function renderSignedIn() {
  elements.authPanel.classList.add("hidden");
  elements.appShell.classList.remove("hidden");
  elements.heroLoginButton.classList.add("hidden");
  session.renderSignedInChrome(elements);
  elements.createPanel.classList.toggle("hidden", !canCreateCases());
  elements.noteForm.classList.toggle("hidden", !canMutateCases());
  elements.statusForm.classList.toggle("hidden", !canMutateCases());
}

function renderCaseList(cases) {
  if (cases.length === 0) {
    elements.caseList.innerHTML = renderEmpty("No hay casos para esos filtros.");
    return;
  }

  elements.caseList.innerHTML = cases
    .map(
      (item) => `
        <article class="case-card" data-case-id="${item.id}">
          <header>
            <strong>${escapeHtml(item.art_name || "Caso sin ART cargada")}</strong>
            <span class="pill">${escapeHtml(item.status)}</span>
          </header>
          <p><strong>Incidente:</strong> ${escapeHtml(item.incident_type)}</p>
          <p><strong>Fecha:</strong> ${escapeHtml(item.incident_date)}</p>
          <p><strong>Paciente:</strong> ${escapeHtml(item.patient_id)}</p>
          <p><strong>Owner:</strong> ${escapeHtml(item.current_owner_role || "sin asignar")}</p>
        </article>
      `,
    )
    .join("");

  for (const node of elements.caseList.querySelectorAll(".case-card")) {
    node.addEventListener("click", () => loadCaseDetail(node.dataset.caseId));
  }

  highlightSelectedCase();
}

function renderCaseDetail() {
  if (!state.selectedCase) {
    return;
  }

  const { documents, encounter, events, incidentCase, patient } = state.selectedCase;
  elements.detailPanel.classList.remove("hidden");
  elements.detailTitle.textContent = `${patient.family_name}, ${patient.given_names}`;
  elements.detailSummary.innerHTML = [
    detailCard("Paciente", formatLines([patient.document_type || "-", patient.document_number || "-"])),
    detailCard("Contacto", formatLines([patient.phone || "-", patient.email || "-"])),
    detailCard("Atencion", formatLines([encounter.provider_name || "-", encounter.practitioner_name || "-"])),
    detailCard("Caso", formatLines([incidentCase.coverage_type, incidentCase.incident_type])),
    detailCard("Estado", formatLines([incidentCase.status, incidentCase.current_owner_role || "-"])),
    detailCard("Notas", escapeHtml(incidentCase.notes || "Sin notas")),
  ].join("");

  elements.statusForm.querySelector("[name='status']").value = incidentCase.status;
  elements.statusForm.querySelector("[name='current_owner_role']").value = incidentCase.current_owner_role || "admission";

  elements.eventList.innerHTML =
    events.length === 0
      ? renderEmpty("Todavia no hay eventos.")
      : events
          .map(
            (item) => `
              <article class="event-card">
                <strong>${escapeHtml(item.event_type)}</strong>
                <p>${escapeHtml(item.summary)}</p>
                <p>${escapeHtml(item.created_at)}${item.actor_id ? ` | ${escapeHtml(item.actor_id)}` : ""}</p>
              </article>
            `,
          )
          .join("");

  elements.documentList.innerHTML =
    documents.length === 0
      ? renderEmpty("Todavia no hay documentos registrados.")
      : documents
          .map(
            (item) => `
              <article class="document-card">
                <strong>${escapeHtml(item.file_name)}</strong>
                <p>${escapeHtml(item.document_type)} | ${escapeHtml(item.mime_type)}</p>
                <p>${escapeHtml(item.storage_key)}</p>
              </article>
            `,
          )
          .join("");
}

function canAccessModule() {
  return session.hasAnyRole(["admin", "admission", "medical_auditor", "billing", "support"]);
}

function canCreateCases() {
  return session.hasAnyRole(["admin", "admission", "support"]);
}

function canMutateCases() {
  return session.hasAnyRole(["admin", "admission", "medical_auditor", "billing", "support"]);
}

function highlightSelectedCase() {
  for (const node of elements.caseList.querySelectorAll(".case-card")) {
    node.classList.toggle("active", node.dataset.caseId === state.selectedCaseId);
  }
}

function detailCard(title, content) {
  return `
    <article class="detail-card">
      <header>
        <strong>${title}</strong>
      </header>
      <p>${content}</p>
    </article>
  `;
}

function formatLines(values) {
  return values.map((value) => escapeHtml(value)).join("<br>");
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

elements.createForm.querySelector("[name='incident_date']").value = todayIso();

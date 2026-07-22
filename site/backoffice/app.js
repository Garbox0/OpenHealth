import { createPlatformSession, escapeHtml, humanizeError, optionalValue } from "/shared/platform.js";

const session = createPlatformSession({ moduleId: "backoffice" });

const state = {
  selectedCaseId: null,
  selectedCase: null,
  caseSummaries: [],
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
  adminWorklist: document.querySelector("#admin-worklist"),
  detailFlags: document.querySelector("#detail-flags"),
  operationStats: document.querySelector("#operation-stats"),
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
    window.location.replace("/");
    return;
  }

  if (!canAccessModule()) {
    window.location.replace("/");
    return;
  }

  renderSignedIn();
  await loadCases();
}

async function loadCases() {
  elements.caseList.innerHTML = renderEmpty("Cargando casos...");

  const filters = new FormData(elements.filtersForm);
  const params = new URLSearchParams();
  const searchTerm = optionalValue(filters.get("q"))?.toLowerCase() || "";

  for (const [key, value] of filters.entries()) {
    if (key !== "q" && value) {
      params.set(key, value);
    }
  }

  const cases = await session.apiFetch(`/incident-cases${params.size ? `?${params}` : ""}`);
  const summaries = await Promise.all(
    cases.map(async (incidentCase) => {
      const [patient, encounter] = await Promise.all([
        session.apiFetch(`/patients/${incidentCase.patient_id}`),
        session.apiFetch(`/encounters/${incidentCase.encounter_id}`),
      ]);
      return { encounter, incidentCase, patient };
    }),
  );

  state.caseSummaries = summaries.filter((item) => matchesSearch(item, searchTerm));
  renderOperationalOverview();
  renderCaseList(state.caseSummaries);

  if (state.selectedCaseId) {
    const stillExists = state.caseSummaries.find((item) => item.incidentCase.id === state.selectedCaseId);
    if (stillExists) {
      await loadCaseDetail(state.selectedCaseId);
      return;
    }
  }

  if (state.caseSummaries.length > 0) {
    await loadCaseDetail(state.caseSummaries[0].incidentCase.id);
    return;
  }

  state.selectedCaseId = null;
  state.selectedCase = null;
  elements.detailPanel.classList.add("hidden");
  elements.detailFlags.innerHTML = "";
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

function renderSignedIn() {
  elements.authPanel.classList.add("hidden");
  elements.appShell.classList.remove("hidden");
  elements.heroLoginButton.classList.add("hidden");
  session.renderSignedInChrome(elements);
  elements.createPanel.classList.toggle("hidden", !canCreateCases());
  elements.noteForm.classList.toggle("hidden", !canMutateCases());
  elements.statusForm.classList.toggle("hidden", !canMutateCases());
}

function renderOperationalOverview() {
  if (state.caseSummaries.length === 0) {
    elements.operationStats.innerHTML = renderEmpty("No hay casos para este filtro.");
    elements.adminWorklist.innerHTML = renderEmpty("Sin pendientes visibles.");
    return;
  }

  const open = state.caseSummaries.filter((item) => item.incidentCase.status === "open").length;
  const art = state.caseSummaries.filter((item) => item.incidentCase.coverage_type === "art").length;
  const missingArt = state.caseSummaries.filter(needsArtData).length;
  const missingContact = state.caseSummaries.filter(needsContact).length;

  elements.operationStats.innerHTML = [
    metricCard("Casos filtrados", state.caseSummaries.length, "Expedientes visibles para este tenant."),
    metricCard("Abiertos", open, "Casos pendientes de circuito operativo."),
    metricCard("ART", art, "Casos con cobertura de aseguradora laboral."),
    metricCard("Datos faltantes", missingArt + missingContact, "Pendientes que frenan auditoria o seguimiento."),
  ].join("");

  elements.adminWorklist.innerHTML = [
    workItem("Completar ART", missingArt, "Casos ART sin numero de siniestro.", missingArt > 0),
    workItem("Contacto paciente", missingContact, "Expedientes sin telefono ni email.", missingContact > 0),
    workItem(
      "Asignar profesional",
      state.caseSummaries.filter((item) => !optionalValue(item.encounter.practitioner_name)).length,
      "Atenciones sin profesional cargado.",
      true,
    ),
    workItem(
      "Derivados",
      state.caseSummaries.filter((item) => optionalValue(item.incidentCase.current_owner_role)).length,
      "Casos con buzon responsable.",
      false,
    ),
  ].join("");
}

function renderCaseList(summaries) {
  if (summaries.length === 0) {
    elements.caseList.innerHTML = renderEmpty("No hay casos para esos filtros.");
    return;
  }

  elements.caseList.innerHTML = summaries
    .map(
      ({ encounter, incidentCase, patient }) => `
        <article class="case-card ${escapeHtml(getAdministrativeTone({ encounter, incidentCase, patient }))}" data-case-id="${incidentCase.id}">
          <header>
            <div>
              <strong>${escapeHtml(formatPatientName(patient))}</strong>
              <p>${escapeHtml(patient.document_type || "doc")} ${escapeHtml(patient.document_number || "sin numero")}</p>
            </div>
            <span class="status-chip ${escapeHtml(incidentCase.status)}">${escapeHtml(humanizeStatus(incidentCase.status))}</span>
          </header>
          <div class="case-meta-grid">
            <p><strong>Motivo:</strong> ${escapeHtml(optionalValue(encounter.chief_complaint) || "Sin motivo")}</p>
            <p><strong>Incidente:</strong> ${escapeHtml(humanizeIncidentType(incidentCase.incident_type))}</p>
            <p><strong>Fecha:</strong> ${escapeHtml(incidentCase.incident_date)}</p>
            <p><strong>Owner:</strong> ${escapeHtml(humanizeOwnerRole(incidentCase.current_owner_role))}</p>
            <p><strong>Cobertura:</strong> ${escapeHtml(optionalValue(incidentCase.art_name) || humanizeCoverage(incidentCase.coverage_type))}</p>
            <p><strong>Profesional:</strong> ${escapeHtml(optionalValue(encounter.practitioner_name) || "Sin asignar")}</p>
          </div>
          <div class="flag-list mini">
            ${renderMiniFlags({ encounter, incidentCase, patient })}
          </div>
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
  elements.detailFlags.innerHTML = buildAdminFlags({ documents, encounter, incidentCase, patient })
    .map(renderFlag)
    .join("");

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

function matchesSearch(item, searchTerm) {
  if (!searchTerm) {
    return true;
  }
  const fields = [
    item.patient.family_name,
    item.patient.given_names,
    item.patient.document_number,
    item.patient.phone,
    item.patient.email,
    item.encounter.practitioner_name,
    item.encounter.provider_name,
    item.encounter.chief_complaint,
    item.incidentCase.art_name,
    item.incidentCase.claim_number,
    item.incidentCase.employer_name,
    item.incidentCase.status,
  ];
  return fields.some((value) => String(value || "").toLowerCase().includes(searchTerm));
}

function metricCard(label, value, copy) {
  return `
    <article class="metric-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(copy)}</p>
    </article>
  `;
}

function workItem(label, value, copy, warning) {
  return `
    <article class="work-item ${warning && value > 0 ? "warning" : "ok"}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(copy)}</p>
    </article>
  `;
}

function buildAdminFlags({ documents, encounter, incidentCase, patient }) {
  const flags = [];
  if (needsArtData({ incidentCase })) {
    flags.push({ tone: "warning", text: "Falta numero de siniestro ART." });
  }
  if (needsContact({ patient })) {
    flags.push({ tone: "warning", text: "Falta telefono o email del paciente." });
  }
  if (!optionalValue(encounter.practitioner_name)) {
    flags.push({ tone: "warning", text: "Falta profesional asignado." });
  }
  if (documents.length === 0) {
    flags.push({ tone: "warning", text: "No hay documentacion adjunta." });
  }
  if (flags.length === 0) {
    flags.push({ tone: "ok", text: "Datos administrativos minimos completos." });
  }
  return flags;
}

function renderMiniFlags(item) {
  return buildAdminFlags({ documents: [], ...item })
    .slice(0, 3)
    .map(renderFlag)
    .join("");
}

function renderFlag(flag) {
  return `<span class="flag ${escapeHtml(flag.tone)}">${escapeHtml(flag.text)}</span>`;
}

function needsArtData({ incidentCase }) {
  return incidentCase.coverage_type === "art" && !optionalValue(incidentCase.claim_number);
}

function needsContact({ patient }) {
  return !optionalValue(patient.phone) && !optionalValue(patient.email);
}

function getAdministrativeTone({ encounter, incidentCase, patient }) {
  if (needsArtData({ incidentCase }) || needsContact({ patient }) || !optionalValue(encounter.practitioner_name)) {
    return "warning";
  }
  return "ok";
}

function formatPatientName(patient) {
  return `${patient.family_name}, ${patient.given_names}`;
}

function humanizeStatus(status) {
  const labels = {
    open: "Abierto",
    in_review: "En revision",
    authorized: "Autorizado",
    rejected: "Rechazado",
    closed: "Cerrado",
  };
  return labels[status] || status;
}

function humanizeCoverage(coverageType) {
  const labels = {
    art: "ART",
    private: "Privada",
    unknown: "Desconocida",
  };
  return labels[coverageType] || coverageType;
}

function humanizeIncidentType(incidentType) {
  const labels = {
    work_accident: "Accidente laboral",
    commute_accident: "Accidente in itinere",
    occupational_exposure: "Exposicion ocupacional",
    other: "Otro evento",
  };
  return labels[incidentType] || incidentType;
}

function humanizeOwnerRole(ownerRole) {
  const labels = {
    admission: "Admision",
    medical_auditor: "Auditoria medica",
    billing: "Facturacion",
    support: "Soporte",
  };
  return ownerRole ? labels[ownerRole] || ownerRole : "Sin asignar";
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

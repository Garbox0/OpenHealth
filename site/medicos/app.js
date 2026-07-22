import { createPlatformSession, escapeHtml, humanizeError, optionalValue } from "/shared/platform.js";

const session = createPlatformSession({ moduleId: "medicos" });

const DATE_FORMATTER = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
});

const state = {
  caseSummaries: [],
  patients: [],
  selectedCase: null,
  selectedCaseId: null,
  selectedPatient: null,
  selectedPatientRecord: null,
};

const elements = {
  appShell: document.querySelector("#app-shell"),
  attentionStrip: document.querySelector("#attention-strip"),
  authCopy: document.querySelector("#auth-copy"),
  authPanel: document.querySelector("#auth-panel"),
  caseList: document.querySelector("#case-list"),
  detailPanel: document.querySelector("#case-detail-panel"),
  detailSummary: document.querySelector("#detail-summary"),
  documentFeedback: document.querySelector("#document-feedback"),
  documentForm: document.querySelector("#case-document-form"),
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
  nextActionPanel: document.querySelector("#next-action-panel"),
  overviewStats: document.querySelector("#overview-stats"),
  patientList: document.querySelector("#patient-list"),
  patientRecordCaseList: document.querySelector("#patient-case-list"),
  patientRecordEncounterList: document.querySelector("#patient-encounter-list"),
  patientRecordMeta: document.querySelector("#patient-record-meta"),
  patientRecordPanel: document.querySelector("#patient-record-panel"),
  patientRecordSummary: document.querySelector("#patient-record-summary"),
  patientRecordTitle: document.querySelector("#patient-record-title"),
  patientSearchForm: document.querySelector("#patient-search-form"),
  priorityList: document.querySelector("#priority-list"),
  referralFeedback: document.querySelector("#referral-feedback"),
  referralForm: document.querySelector("#case-referral-form"),
  refreshCasesButton: document.querySelector("#refresh-cases-button"),
  roleList: document.querySelector("#role-list"),
  selectedCaseAlerts: document.querySelector("#selected-case-alerts"),
  selectedCaseBanner: document.querySelector("#selected-case-banner"),
  selectedCaseMeta: document.querySelector("#selected-case-meta"),
  selectedCaseWorklist: document.querySelector("#selected-case-worklist"),
  signatureButton: document.querySelector("#signature-button"),
  signatureFeedback: document.querySelector("#signature-feedback"),
  tenantBadge: document.querySelector("#tenant-badge"),
  tenantName: document.querySelector("#tenant-name"),
  tenantSupport: document.querySelector("#tenant-support"),
  userMeta: document.querySelector("#user-meta"),
  userName: document.querySelector("#user-name"),
  workflowSummary: document.querySelector("#workflow-summary"),
};

bootstrap().catch((error) => {
  console.error(error);
  renderSignedOut(humanizeError(error));
});

elements.filtersForm.addEventListener("submit", handleFilterSubmit);
elements.patientSearchForm.addEventListener("submit", handlePatientSearch);
elements.heroLoginButton.addEventListener("click", () => session.startLogin());
elements.loginButton.addEventListener("click", () => session.startLogin());
elements.logoutButton.addEventListener("click", () => session.logout());
elements.documentForm.addEventListener("submit", handleAddDocument);
elements.noteForm.addEventListener("submit", handleAddNote);
elements.referralForm.addEventListener("submit", handleAddReferral);
elements.refreshCasesButton.addEventListener("click", () => loadCases());
elements.signatureButton.addEventListener("click", handleAddSignature);

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
  await loadPatients();
  await loadCases();
}

async function loadPatients(searchTerm = "") {
  elements.patientList.innerHTML = renderEmpty("Buscando pacientes...");

  const params = new URLSearchParams();
  if (searchTerm) {
    params.set("q", searchTerm);
  }

  const patients = await session.apiFetch(`/patients${params.size ? `?${params}` : ""}`);
  state.patients = patients;
  renderPatientList(patients);
}

async function loadCases() {
  elements.caseList.innerHTML = renderEmpty("Cargando casos...");

  const form = new FormData(elements.filtersForm);
  const params = new URLSearchParams();
  const searchTerm = optionalValue(form.get("q"))?.toLowerCase() || "";

  for (const [key, value] of form.entries()) {
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

  state.caseSummaries = summaries
    .filter((item) => matchesSearch(item, searchTerm))
    .sort(compareByClinicalPriority);
  renderOverview();
  renderClinicalCommandCenter();
  renderCaseList(state.caseSummaries);

  if (state.caseSummaries.length === 0) {
    state.selectedCase = null;
    state.selectedCaseId = null;
    elements.detailPanel.classList.add("hidden");
    elements.selectedCaseWorklist.innerHTML = "";
    return;
  }

  const selected = state.caseSummaries.find((item) => item.incidentCase.id === state.selectedCaseId);
  await loadCaseDetail((selected || state.caseSummaries[0]).incidentCase.id);
}

async function loadCaseDetail(caseId) {
  state.selectedCaseId = caseId;

  const summary = state.caseSummaries.find((item) => item.incidentCase.id === caseId);
  const incidentCase = await session.apiFetch(`/incident-cases/${caseId}`);
  const events = await session.apiFetch(`/incident-cases/${caseId}/events`);
  const documents = await session.apiFetch(`/incident-cases/${caseId}/documents`);
  const patient = summary?.patient || (await session.apiFetch(`/patients/${incidentCase.patient_id}`));
  const encounter = summary?.encounter || (await session.apiFetch(`/encounters/${incidentCase.encounter_id}`));

  state.selectedCase = { documents, encounter, events, incidentCase, patient };
  renderCaseDetail();
  highlightSelectedCase();
}

async function handleFilterSubmit(event) {
  event.preventDefault();
  await loadCases();
}

async function handlePatientSearch(event) {
  event.preventDefault();
  const form = new FormData(elements.patientSearchForm);
  await loadPatients(optionalValue(form.get("q")) || "");
}

async function handleSelectPatient(patientId) {
  const patient = state.patients.find((item) => item.id === patientId);
  if (!patient) {
    return;
  }

  await loadPatientRecord(patient);
  const searchValue = optionalValue(patient.document_number) || formatPatientName(patient);
  elements.filtersForm.elements.q.value = searchValue;
  await loadCases();
}

async function loadPatientRecord(patient) {
  state.selectedPatient = patient;
  state.selectedPatientRecord = null;
  elements.patientRecordPanel.classList.remove("hidden");
  elements.patientRecordTitle.textContent = formatPatientName(patient);
  elements.patientRecordMeta.textContent = "Cargando expediente...";
  elements.patientRecordSummary.innerHTML = "";
  elements.patientRecordEncounterList.innerHTML = renderEmpty("Buscando atenciones...");
  elements.patientRecordCaseList.innerHTML = renderEmpty("Buscando casos asociados...");

  const [encounters, cases] = await Promise.all([
    session.apiFetch(`/encounters?patient_id=${patient.id}`),
    session.apiFetch(`/incident-cases?patient_id=${patient.id}`),
  ]);
  state.selectedPatientRecord = { cases, encounters, patient };
  renderPatientRecord();
}

async function handleOpenPatientCase(caseId) {
  if (!state.selectedPatient) {
    return;
  }

  state.selectedCaseId = caseId;
  elements.filtersForm.elements.q.value =
    optionalValue(state.selectedPatient.document_number) || formatPatientName(state.selectedPatient);
  elements.filtersForm.elements.status.value = "";
  elements.filtersForm.elements.coverage_type.value = "";
  await loadCases();
}

async function handleAddNote(event) {
  event.preventDefault();
  if (!state.selectedCaseId) {
    return;
  }

  const form = new FormData(elements.noteForm);
  setFeedback(elements.noteFeedback, "Guardando nota clinica...");

  try {
    await session.apiFetch(`/incident-cases/${state.selectedCaseId}/events`, {
      method: "POST",
      body: JSON.stringify({
        event_type: "clinical_note",
        summary: form.get("summary"),
      }),
    });
    elements.noteForm.reset();
    setFeedback(elements.noteFeedback, "Nota clinica guardada.", true);
    await loadCaseDetail(state.selectedCaseId);
  } catch (error) {
    setFeedback(elements.noteFeedback, humanizeError(error), false);
  }
}

async function handleAddReferral(event) {
  event.preventDefault();
  if (!state.selectedCaseId) {
    return;
  }

  const form = new FormData(elements.referralForm);
  const destination = optionalValue(form.get("destination"));
  const priority = optionalValue(form.get("priority")) || "normal";
  const summary = optionalValue(form.get("summary"));
  setFeedback(elements.referralFeedback, "Registrando derivacion...");

  try {
    await session.apiFetch(`/incident-cases/${state.selectedCaseId}/events`, {
      method: "POST",
      body: JSON.stringify({
        event_type: "referral_requested",
        summary: `Derivacion a ${destination} | prioridad ${priority}: ${summary}`,
      }),
    });
    const ownerRole = ownerRoleForDestination(destination);
    if (ownerRole) {
      await session.apiFetch(`/incident-cases/${state.selectedCaseId}`, {
        method: "PATCH",
        body: JSON.stringify({ current_owner_role: ownerRole }),
      });
    }
    elements.referralForm.reset();
    setFeedback(elements.referralFeedback, "Derivacion registrada.", true);
    await loadCaseDetail(state.selectedCaseId);
  } catch (error) {
    setFeedback(elements.referralFeedback, humanizeError(error), false);
  }
}

async function handleAddDocument(event) {
  event.preventDefault();
  if (!state.selectedCaseId) {
    return;
  }

  const form = new FormData(elements.documentForm);
  setFeedback(elements.documentFeedback, "Adjuntando referencia...");

  try {
    await session.apiFetch(`/incident-cases/${state.selectedCaseId}/documents`, {
      method: "POST",
      body: JSON.stringify({
        document_type: form.get("document_type"),
        file_name: form.get("file_name"),
        storage_key: form.get("storage_key"),
        mime_type: guessMimeType(form.get("file_name")),
      }),
    });
    elements.documentForm.reset();
    setFeedback(elements.documentFeedback, "Referencia documental adjuntada.", true);
    await loadCaseDetail(state.selectedCaseId);
  } catch (error) {
    setFeedback(elements.documentFeedback, humanizeError(error), false);
  }
}

async function handleAddSignature() {
  if (!state.selectedCaseId || !state.selectedCase) {
    return;
  }

  const actor = session.state.actor;
  setFeedback(elements.signatureFeedback, "Firmando trazabilidad...");

  try {
    await session.apiFetch(`/incident-cases/${state.selectedCaseId}/events`, {
      method: "POST",
      body: JSON.stringify({
        event_type: "clinical_signature",
        summary: `Firma simple registrada por ${actor?.username || "usuario"} sobre el expediente de ${formatPatientName(state.selectedCase.patient)}.`,
      }),
    });
    setFeedback(elements.signatureFeedback, "Firma simple registrada.", true);
    await loadCaseDetail(state.selectedCaseId);
  } catch (error) {
    setFeedback(elements.signatureFeedback, humanizeError(error), false);
  }
}

function renderSignedOut(message) {
  state.caseSummaries = [];
  state.patients = [];
  state.selectedCase = null;
  state.selectedCaseId = null;
  state.selectedPatient = null;
  state.selectedPatientRecord = null;
  elements.appShell.classList.add("hidden");
  elements.patientRecordPanel.classList.add("hidden");
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

function renderPatientList(patients) {
  if (patients.length === 0) {
    elements.patientList.innerHTML = renderEmpty("No encontramos pacientes con ese criterio.");
    return;
  }

  elements.patientList.innerHTML = patients
    .map(
      (patient) => `
        <article class="patient-card">
          <div>
            <strong>${escapeHtml(formatPatientName(patient))}</strong>
            <p>${escapeHtml(formatPatientDocument(patient))}</p>
          </div>
          <div class="patient-meta">
            <span>${escapeHtml(optionalValue(patient.phone) || "Sin telefono")}</span>
            <span>${escapeHtml(optionalValue(patient.email) || "Sin email")}</span>
          </div>
          <button class="ghost patient-case-button" type="button" data-patient-id="${patient.id}">
            Ver expediente
          </button>
        </article>
      `,
    )
    .join("");

  for (const node of elements.patientList.querySelectorAll(".patient-case-button")) {
    node.addEventListener("click", () => handleSelectPatient(node.dataset.patientId));
  }
}

function renderPatientRecord() {
  const record = state.selectedPatientRecord;
  if (!record) {
    return;
  }

  const { cases, encounters, patient } = record;
  elements.patientRecordTitle.textContent = formatPatientName(patient);
  elements.patientRecordMeta.textContent = formatPatientDocument(patient);
  elements.patientRecordSummary.innerHTML = renderDetailList([
    ["Edad", formatAge(patient.birth_date)],
    ["Telefono", optionalValue(patient.phone) || "Sin telefono"],
    ["Email", optionalValue(patient.email) || "Sin email"],
    ["Actualizado", formatDateTime(patient.updated_at)],
  ]);
  elements.patientRecordEncounterList.innerHTML = encounters.length
    ? encounters
        .map(
          (encounter) => `
            <article class="record-card">
              <div>
                <strong>${escapeHtml(formatDateTime(encounter.started_at))}</strong>
                <p>${escapeHtml(optionalValue(encounter.chief_complaint) || "Sin motivo registrado")}</p>
              </div>
              <span class="record-status">${escapeHtml(humanizeStatus(encounter.status))}</span>
            </article>
          `,
        )
        .join("")
    : renderEmpty("Todavia no hay atenciones registradas.");
  elements.patientRecordCaseList.innerHTML = cases.length
    ? cases
        .map(
          (incidentCase) => `
            <article class="record-card">
              <div>
                <strong>${escapeHtml(humanizeIncidentType(incidentCase.incident_type))}</strong>
                <p>${escapeHtml(`${humanizeCoverage(incidentCase.coverage_type)} | ${formatDate(incidentCase.incident_date)}`)}</p>
              </div>
              <button class="ghost record-case-button" type="button" data-case-id="${incidentCase.id}">
                Abrir caso
              </button>
            </article>
          `,
        )
        .join("")
    : renderEmpty("No hay casos asociados a este expediente.");

  for (const node of elements.patientRecordCaseList.querySelectorAll(".record-case-button")) {
    node.addEventListener("click", () => handleOpenPatientCase(node.dataset.caseId));
  }
}

function renderOverview() {
  if (state.caseSummaries.length === 0) {
    elements.overviewStats.innerHTML = renderEmpty("Todavia no hay casos cargados para este filtro.");
    elements.attentionStrip.innerHTML = "";
    return;
  }

  const totalCases = state.caseSummaries.length;
  const inReviewCount = state.caseSummaries.filter((item) => item.incidentCase.status === "in_review").length;
  const artCount = state.caseSummaries.filter((item) => item.incidentCase.coverage_type === "art").length;
  const missingPractitionerCount = state.caseSummaries.filter(
    (item) => !optionalValue(item.encounter.practitioner_name),
  ).length;

  const metrics = [
    {
      label: "Casos filtrados",
      value: totalCases,
      copy: "Expedientes visibles segun tus filtros y el tenant actual.",
    },
    {
      label: "En revision",
      value: inReviewCount,
      copy: "Casos que todavia demandan lectura clinica o auditoria.",
    },
    {
      label: "Con cobertura ART",
      value: artCount,
      copy: "Circuitos que probablemente terminaran integrados con aseguradoras.",
    },
    {
      label: "Sin profesional",
      value: missingPractitionerCount,
      copy: "Atenciones con contexto incompleto para el equipo clinico.",
    },
  ];

  elements.overviewStats.innerHTML = metrics.map(renderMetricCard).join("");

  const latestCase = state.caseSummaries[0];
  elements.attentionStrip.innerHTML = `
    <div>
      <strong>Foco sugerido</strong>
      <p>
        ${escapeHtml(formatPatientName(latestCase.patient))} ingreso el ${escapeHtml(formatDate(latestCase.incidentCase.incident_date))}
        con cobertura ${escapeHtml(humanizeCoverage(latestCase.incidentCase.coverage_type))}.
      </p>
    </div>
    <div class="banner-pill-row">
      <span class="status-chip ${escapeHtml(latestCase.incidentCase.status)}">${escapeHtml(humanizeStatus(latestCase.incidentCase.status))}</span>
      <span class="soft-chip">${escapeHtml(humanizeIncidentType(latestCase.incidentCase.incident_type))}</span>
      <span class="soft-chip">${escapeHtml(optionalValue(latestCase.encounter.practitioner_name) || "Sin profesional asignado")}</span>
    </div>
  `;
}

function renderClinicalCommandCenter() {
  if (state.caseSummaries.length === 0) {
    elements.priorityList.innerHTML = renderEmpty("Sin prioridades para este filtro.");
    elements.workflowSummary.innerHTML = renderEmpty("Sin pendientes visibles.");
    return;
  }

  elements.priorityList.innerHTML = state.caseSummaries
    .slice(0, 5)
    .map(renderPriorityItem)
    .join("");

  for (const node of elements.priorityList.querySelectorAll(".priority-item")) {
    node.addEventListener("click", () => loadCaseDetail(node.dataset.caseId));
  }

  const workflow = buildWorkflowSummary(state.caseSummaries);
  elements.workflowSummary.innerHTML = workflow.map(renderWorkflowItem).join("");
}

function renderCaseList(summaries) {
  if (summaries.length === 0) {
    elements.caseList.innerHTML = renderEmpty("No hay casos que coincidan con esos filtros.");
    return;
  }

  elements.caseList.innerHTML = summaries
    .map(
      (item) => {
        const { encounter, incidentCase, patient } = item;
        const priority = getClinicalPriority(item);

        return `
        <article class="case-card ${escapeHtml(priority.tone)}" data-case-id="${incidentCase.id}">
          <div class="case-card-main">
            <header>
              <div>
                <strong>${escapeHtml(formatPatientName(patient))}</strong>
                <p>${escapeHtml(patient.document_type || "doc")} ${escapeHtml(patient.document_number || "sin numero")}</p>
              </div>
              <div class="case-chip-row">
                <span class="priority-chip ${escapeHtml(priority.tone)}">${escapeHtml(priority.label)}</span>
                <span class="status-chip ${escapeHtml(incidentCase.status)}">${escapeHtml(humanizeStatus(incidentCase.status))}</span>
                <span class="soft-chip">${escapeHtml(humanizeCoverage(incidentCase.coverage_type))}</span>
              </div>
            </header>

            <div class="case-card-meta">
              <div class="case-meta-row">
                <strong>Motivo</strong>
                <span>${escapeHtml(optionalValue(encounter.chief_complaint) || "Sin motivo cargado")}</span>
              </div>
              <div class="case-meta-row">
                <strong>Profesional</strong>
                <span>${escapeHtml(optionalValue(encounter.practitioner_name) || "Sin asignar")}</span>
              </div>
              <div class="case-meta-row">
                <strong>Cobertura</strong>
                <span>${escapeHtml(optionalValue(incidentCase.art_name) || humanizeCoverage(incidentCase.coverage_type))}</span>
              </div>
              <div class="case-meta-row">
                <strong>Incidente</strong>
                <span>${escapeHtml(formatDate(incidentCase.incident_date))} | ${escapeHtml(humanizeIncidentType(incidentCase.incident_type))}</span>
              </div>
            </div>
          </div>
        </article>
      `;
      },
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
  const clinicalAlerts = buildClinicalAlerts({ documents, encounter, events, incidentCase, patient });

  elements.detailPanel.classList.remove("hidden");
  elements.detailTitle.textContent = formatPatientName(patient);
  elements.selectedCaseMeta.textContent = `Ultimo movimiento ${formatDateTime(incidentCase.updated_at)}`;
  elements.selectedCaseBanner.innerHTML = `
    <div>
      <p class="eyebrow">Expediente activo</p>
      <strong>${escapeHtml(humanizeIncidentType(incidentCase.incident_type))}</strong>
      <p>
        ${escapeHtml(optionalValue(encounter.chief_complaint) || "Sin motivo de consulta cargado")} |
        ingreso ${escapeHtml(formatDate(incidentCase.incident_date))}
      </p>
    </div>
    <div class="banner-pill-row">
      <span class="status-chip ${escapeHtml(incidentCase.status)}">${escapeHtml(humanizeStatus(incidentCase.status))}</span>
      <span class="soft-chip">${escapeHtml(humanizeOwnerRole(incidentCase.current_owner_role))}</span>
      <span class="soft-chip">${escapeHtml(`${documents.length} documento(s)`)}</span>
      <span class="soft-chip">${escapeHtml(`${events.length} evento(s)`)}</span>
    </div>
  `;
  elements.selectedCaseAlerts.innerHTML = clinicalAlerts.map(renderFlag).join("");
  elements.nextActionPanel.innerHTML = renderNextActionPanel(
    getNextAction({ documents, encounter, events, incidentCase, patient }),
  );
  elements.selectedCaseWorklist.innerHTML = renderSelectedCaseWorklist({
    documents,
    events,
    incidentCase,
    patient,
  });
  elements.detailSummary.innerHTML = [
    detailCard(
      "Identificacion",
      renderDetailList([
        ["Paciente", formatPatientName(patient)],
        ["Documento", `${patient.document_type || "-"} ${patient.document_number || "-"}`],
        ["Edad", formatAge(patient.birth_date)],
      ]),
    ),
    detailCard(
      "Contacto",
      renderDetailList([
        ["Telefono", patient.phone || "-"],
        ["Email", patient.email || "-"],
        ["Nacimiento", patient.birth_date ? formatDate(patient.birth_date) : "-"],
      ]),
    ),
    detailCard(
      "Atencion",
      renderDetailList([
        ["Institucion", encounter.provider_name || "-"],
        ["Profesional", encounter.practitioner_name || "-"],
        ["Inicio", formatDateTime(encounter.started_at)],
      ]),
    ),
    detailCard(
      "Cobertura y siniestro",
      renderDetailList([
        ["Cobertura", humanizeCoverage(incidentCase.coverage_type)],
        ["ART", incidentCase.art_name || "-"],
        ["Siniestro", incidentCase.claim_number || "-"],
      ]),
    ),
    detailCard(
      "Seguimiento",
      renderDetailList([
        ["Estado", humanizeStatus(incidentCase.status)],
        ["Owner", humanizeOwnerRole(incidentCase.current_owner_role)],
        ["Reportado por", incidentCase.reported_by || "-"],
      ]),
    ),
    detailCard(
      "Contexto adicional",
      renderDetailList([
        ["Empleador", incidentCase.employer_name || "-"],
        ["Notas de admision", incidentCase.notes || "Sin notas iniciales"],
        ["Actualizado", formatDateTime(incidentCase.updated_at)],
      ]),
    ),
  ].join("");

  elements.eventList.innerHTML =
    events.length === 0
      ? renderEmpty("Todavia no hay eventos.")
      : events
          .map(
            (item) => `
              <article class="event-card">
                <div class="event-topline">
                  <strong>${escapeHtml(humanizeEventType(item.event_type))}</strong>
                  <span class="soft-chip">${escapeHtml(formatDateTime(item.created_at))}</span>
                </div>
                <p>${escapeHtml(item.summary)}</p>
                <p class="event-meta">
                  ${item.actor_id ? `Actor ${escapeHtml(item.actor_id)}` : "Sin actor informado"}
                  ${item.to_status ? ` | cambio a ${escapeHtml(humanizeStatus(item.to_status))}` : ""}
                </p>
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
                <div class="document-topline">
                  <strong>${escapeHtml(item.file_name)}</strong>
                  <span class="soft-chip">${escapeHtml(formatDateTime(item.created_at))}</span>
                </div>
                <p>${escapeHtml(item.document_type)} | ${escapeHtml(item.mime_type)}</p>
                <p class="document-meta">${escapeHtml(item.storage_key)}</p>
              </article>
            `,
          )
          .join("");
}

function renderPriorityItem(item) {
  const { encounter, incidentCase, patient } = item;
  const priority = getClinicalPriority(item);
  return `
    <button class="priority-item ${escapeHtml(priority.tone)}" type="button" data-case-id="${incidentCase.id}">
      <span class="priority-rank">${escapeHtml(priority.label)}</span>
      <strong>${escapeHtml(formatPatientName(patient))}</strong>
      <span>${escapeHtml(optionalValue(encounter.chief_complaint) || humanizeIncidentType(incidentCase.incident_type))}</span>
    </button>
  `;
}

function renderWorkflowItem(item) {
  return `
    <article class="workflow-item ${escapeHtml(item.tone)}">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.count)}</strong>
      <p>${escapeHtml(item.copy)}</p>
    </article>
  `;
}

function renderSelectedCaseWorklist({ documents, events, incidentCase, patient }) {
  const checks = [
    {
      done: events.some((event) => event.event_type === "clinical_note"),
      label: "Nota clinica",
      copy: "Dejar evolucion o conducta indicada.",
    },
    {
      done: documents.length > 0,
      label: "Documentacion",
      copy: "Adjuntar estudios, formularios o referencias PACS/RX.",
    },
    {
      done: optionalValue(patient.phone) || optionalValue(patient.email),
      label: "Contacto",
      copy: "Tener un dato minimo para seguimiento.",
    },
    {
      done: incidentCase.coverage_type !== "art" || optionalValue(incidentCase.claim_number),
      label: "Siniestro ART",
      copy: "Completar numero de siniestro cuando aplique.",
    },
    {
      done: events.some((event) => event.event_type === "clinical_signature"),
      label: "Firma",
      copy: "Firmar trazabilidad del expediente.",
    },
  ];

  return `
    <section class="clinical-checklist" aria-label="Checklist clinico">
      ${checks.map(renderChecklistItem).join("")}
    </section>
  `;
}

function renderNextActionPanel(action) {
  return `
    <section class="next-action-card ${escapeHtml(action.tone)}">
      <div>
        <p class="eyebrow">Proxima accion</p>
        <strong>${escapeHtml(action.title)}</strong>
        <p>${escapeHtml(action.copy)}</p>
      </div>
      <a class="secondary next-action-link" href="${escapeHtml(action.href)}">${escapeHtml(action.cta)}</a>
    </section>
  `;
}

function getNextAction({ documents, encounter, events, incidentCase, patient }) {
  if (!events.some((event) => event.event_type === "clinical_note")) {
    return {
      copy: "Todavia no hay evolucion clinica en la linea de tiempo.",
      cta: "Escribir nota",
      href: "#case-note-form",
      title: "Registrar evolucion",
      tone: "warning",
    };
  }
  if (documents.length === 0) {
    return {
      copy: "Adjunta estudios, formularios o referencia PACS/RX al expediente.",
      cta: "Adjuntar",
      href: "#case-document-form",
      title: "Completar documentacion",
      tone: "warning",
    };
  }
  if (incidentCase.coverage_type === "art" && !optionalValue(incidentCase.claim_number)) {
    return {
      copy: "El caso ART necesita numero de siniestro para seguir administrativo/auditoria.",
      cta: "Derivar",
      href: "#case-referral-form",
      title: "Derivar a administracion",
      tone: "warning",
    };
  }
  if (!optionalValue(encounter.practitioner_name)) {
    return {
      copy: "La atencion no tiene profesional tratante cargado.",
      cta: "Derivar",
      href: "#case-referral-form",
      title: "Asignar responsable",
      tone: "info",
    };
  }
  if (!optionalValue(patient.phone) && !optionalValue(patient.email)) {
    return {
      copy: "Falta un dato minimo de contacto para seguimiento.",
      cta: "Derivar",
      href: "#case-referral-form",
      title: "Completar contacto",
      tone: "info",
    };
  }
  if (!events.some((event) => event.event_type === "clinical_signature")) {
    return {
      copy: "El expediente ya tiene datos minimos; falta firmar la trazabilidad.",
      cta: "Firmar",
      href: "#signature-button",
      title: "Firmar evento",
      tone: "ok",
    };
  }
  return {
    copy: "No hay bloqueos minimos visibles para este expediente.",
    cta: "Ver timeline",
    href: "#event-list",
    title: "Continuar seguimiento",
    tone: "ok",
  };
}

function renderChecklistItem(item) {
  const status = item.done ? "ok" : "pending";
  return `
    <article class="check-item ${status}">
      <span class="check-dot">${item.done ? "OK" : "Pendiente"}</span>
      <strong>${escapeHtml(item.label)}</strong>
      <p>${escapeHtml(item.copy)}</p>
    </article>
  `;
}

function canAccessModule() {
  return session.hasAnyRole(["admin", "doctor"]);
}

function matchesSearch(item, searchTerm) {
  if (!searchTerm) {
    return true;
  }

  const fields = [
    item.patient.family_name,
    item.patient.given_names,
    item.patient.document_number,
    item.encounter.practitioner_name,
    item.encounter.provider_name,
    item.encounter.chief_complaint,
    item.incidentCase.art_name,
    item.incidentCase.coverage_type,
    item.incidentCase.status,
  ];

  return fields.some((value) => String(value || "").toLowerCase().includes(searchTerm));
}

function highlightSelectedCase() {
  for (const node of elements.caseList.querySelectorAll(".case-card")) {
    node.classList.toggle("active", node.dataset.caseId === state.selectedCaseId);
  }
  for (const node of elements.priorityList.querySelectorAll(".priority-item")) {
    node.classList.toggle("active", node.dataset.caseId === state.selectedCaseId);
  }
}

function renderMetricCard(metric) {
  return `
    <article class="metric-card">
      <span class="metric-label">${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
      <p class="metric-copy">${escapeHtml(metric.copy)}</p>
    </article>
  `;
}

function detailCard(title, content) {
  return `
    <article class="detail-card">
      <header>
        <strong>${escapeHtml(title)}</strong>
      </header>
      ${content}
    </article>
  `;
}

function renderDetailList(rows) {
  return `
    <dl class="detail-list">
      ${rows
        .map(
          ([label, value]) => `
            <div class="detail-row">
              <dt>${escapeHtml(label)}</dt>
              <dd>${escapeHtml(value)}</dd>
            </div>
          `,
        )
        .join("")}
    </dl>
  `;
}

function buildClinicalAlerts({ documents, encounter, events, incidentCase, patient }) {
  const alerts = [];

  if (!optionalValue(encounter.practitioner_name)) {
    alerts.push({ tone: "warning", text: "Falta profesional tratante asignado en la atencion." });
  }
  if (!optionalValue(patient.phone) && !optionalValue(patient.email)) {
    alerts.push({ tone: "warning", text: "No hay datos de contacto cargados para el paciente." });
  }
  if (incidentCase.coverage_type === "art" && !optionalValue(incidentCase.claim_number)) {
    alerts.push({ tone: "warning", text: "Caso ART sin numero de siniestro registrado." });
  }
  if (documents.length === 0) {
    alerts.push({ tone: "warning", text: "Todavia no hay estudios ni documentacion asociada." });
  }
  if (!events.some((event) => event.event_type === "clinical_note")) {
    alerts.push({ tone: "ok", text: "Todavia no hay notas clinicas: este medico puede iniciar la trazabilidad." });
  }
  if (alerts.length === 0) {
    alerts.push({ tone: "ok", text: "El expediente tiene datos minimos completos para seguir trabajando." });
  }

  return alerts;
}

function buildWorkflowSummary(summaries) {
  const needsReview = summaries.filter((item) => item.incidentCase.status === "open").length;
  const needsDocumentation = summaries.filter((item) => !optionalValue(item.encounter.practitioner_name)).length;
  const needsArtData = summaries.filter(
    (item) => item.incidentCase.coverage_type === "art" && !optionalValue(item.incidentCase.claim_number),
  ).length;
  const routed = summaries.filter((item) => optionalValue(item.incidentCase.current_owner_role)).length;

  return [
    {
      count: needsReview,
      label: "Evaluar",
      copy: "Casos abiertos que todavia necesitan lectura clinica.",
      tone: needsReview > 0 ? "warning" : "ok",
    },
    {
      count: needsDocumentation,
      label: "Asignar profesional",
      copy: "Atenciones sin medico tratante cargado.",
      tone: needsDocumentation > 0 ? "warning" : "ok",
    },
    {
      count: needsArtData,
      label: "Completar ART",
      copy: "Siniestros sin numero o contexto administrativo completo.",
      tone: needsArtData > 0 ? "warning" : "ok",
    },
    {
      count: routed,
      label: "En buzones",
      copy: "Casos derivados a un area responsable.",
      tone: routed > 0 ? "info" : "ok",
    },
  ];
}

function compareByClinicalPriority(a, b) {
  return getClinicalPriority(b).score - getClinicalPriority(a).score;
}

function getClinicalPriority({ encounter, incidentCase, patient }) {
  let score = 0;
  const reasons = [];

  if (incidentCase.status === "in_review") {
    score += 40;
    reasons.push("en revision");
  }
  if (incidentCase.status === "open") {
    score += 30;
    reasons.push("abierto");
  }
  if (incidentCase.coverage_type === "art" && !optionalValue(incidentCase.claim_number)) {
    score += 25;
    reasons.push("ART incompleta");
  }
  if (!optionalValue(encounter.practitioner_name)) {
    score += 20;
    reasons.push("sin profesional");
  }
  if (!optionalValue(patient.phone) && !optionalValue(patient.email)) {
    score += 10;
    reasons.push("sin contacto");
  }

  if (score >= 65) {
    return { label: "Alta", reasons, score, tone: "high" };
  }
  if (score >= 30) {
    return { label: "Media", reasons, score, tone: "medium" };
  }
  return { label: "Baja", reasons, score, tone: "low" };
}

function renderFlag(flag) {
  return `<span class="flag ${escapeHtml(flag.tone)}">${escapeHtml(flag.text)}</span>`;
}

function formatPatientName(patient) {
  return `${patient.family_name}, ${patient.given_names}`;
}

function formatPatientDocument(patient) {
  return `${patient.document_type || "doc"} ${patient.document_number || "sin numero"}`;
}

function formatDate(value) {
  return DATE_FORMATTER.format(new Date(value));
}

function formatDateTime(value) {
  return DATE_TIME_FORMATTER.format(new Date(value));
}

function formatAge(birthDate) {
  if (!birthDate) {
    return "-";
  }

  const today = new Date();
  const birth = new Date(birthDate);
  let years = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) {
    years -= 1;
  }
  return `${years} anos`;
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
  return ownerRole ? labels[ownerRole] || ownerRole : "Sin owner";
}

function humanizeEventType(eventType) {
  const labels = {
    case_created: "Caso creado",
    clinical_signature: "Firma simple",
    status_changed: "Cambio de estado",
    clinical_note: "Nota clinica",
    referral_requested: "Derivacion solicitada",
  };
  return labels[eventType] || eventType;
}

function guessMimeType(fileName) {
  const normalized = String(fileName || "").toLowerCase();
  if (normalized.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (normalized.endsWith(".png")) {
    return "image/png";
  }
  return "application/octet-stream";
}

function ownerRoleForDestination(destination) {
  const roles = {
    "Administracion": "admission",
    "ART / Auditoria": "medical_auditor",
  };
  return roles[destination] || null;
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

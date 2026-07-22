import { getTenantContext } from "/shared/tenant.js";

const AUTH_CONFIG = {
  issuer: "https://auth.aerosftp.com/realms/openhealth",
  clientId: "openhealth-dev",
  apiBaseUrl: "https://api.aerosftp.com/api/v1",
  scope: "openid profile email",
};

const STORAGE_KEYS = {
  authState: "ohb.sso.pkce.state",
  codeVerifier: "ohb.sso.pkce.verifier",
  returnTo: "ohb.sso.return_to",
  tokenSet: "ohb.sso.tokens",
};

export const PLATFORM_MODULES = {
  home: {
    href: "/",
    label: "Inicio",
    roles: ["admin", "admission", "medical_auditor", "billing", "support", "doctor", "patient"],
  },
  backoffice: {
    href: "/backoffice/",
    label: "Backoffice",
    roles: ["admin", "admission", "medical_auditor", "billing", "support"],
  },
  medicos: {
    href: "/medicos/",
    label: "Portal medico",
    roles: ["admin", "doctor"],
  },
  seguridad: {
    href: "/seguridad/",
    label: "Seguridad e IT",
    roles: ["admin"],
  },
};

export function createPlatformSession({ moduleId }) {
  const currentModule = PLATFORM_MODULES[moduleId];
  const tenant = getTenantContext();
  if (!currentModule) {
    throw new Error(`Modulo desconocido: ${moduleId}`);
  }

  const state = {
    actor: null,
    discovery: null,
    tokens: readTokenSet(),
  };

  async function bootstrap() {
    state.discovery = await getDiscoveryDocument();
    await handleOidcReturn();
    syncTokensFromStorage();

    if (!state.tokens) {
      return false;
    }

    await ensureFreshToken();
    state.actor = await apiFetch("/me");
    return true;
  }

  async function getDiscoveryDocument() {
    const response = await fetch(`${AUTH_CONFIG.issuer}/.well-known/openid-configuration`);
    if (!response.ok) {
      throw new Error("No pude descubrir la configuracion OIDC.");
    }
    return response.json();
  }

  async function startLogin() {
    if (!state.discovery) {
      state.discovery = await getDiscoveryDocument();
    }

    const redirectUri = currentRedirectUri();
    const verifier = randomString(64);
    const stateValue = randomString(32);
    const challenge = await pkceChallenge(verifier);

    sessionStorage.setItem(STORAGE_KEYS.codeVerifier, verifier);
    sessionStorage.setItem(STORAGE_KEYS.authState, stateValue);
    sessionStorage.setItem(STORAGE_KEYS.returnTo, redirectUri);

    const params = new URLSearchParams({
      client_id: AUTH_CONFIG.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: AUTH_CONFIG.scope,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: stateValue,
    });

    window.location.assign(`${state.discovery.authorization_endpoint}?${params.toString()}`);
  }

  async function handleOidcReturn() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      throw new Error("Keycloak rechazo el inicio de sesion.");
    }

    if (!code) {
      return;
    }

    const redirectUri = currentRedirectUri();
    const expectedState = sessionStorage.getItem(STORAGE_KEYS.authState);
    const verifier = sessionStorage.getItem(STORAGE_KEYS.codeVerifier);
    const returnTo = sessionStorage.getItem(STORAGE_KEYS.returnTo) || redirectUri;

    if (!expectedState || returnedState !== expectedState || !verifier) {
      throw new Error("La respuesta de autenticacion no coincide con la sesion actual.");
    }

    const tokenResponse = await fetch(state.discovery.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: AUTH_CONFIG.clientId,
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("No pude intercambiar el codigo de login por tokens.");
    }

    state.tokens = await tokenResponse.json();
    persistTokenSet(state.tokens);
    clearPendingLogin();
    window.history.replaceState({}, document.title, returnTo);
  }

  async function ensureFreshToken() {
    syncTokensFromStorage();

    if (!state.tokens) {
      return null;
    }

    const payload = decodeJwt(state.tokens.access_token);
    const secondsLeft = payload.exp - Math.floor(Date.now() / 1000);
    if (secondsLeft > 90) {
      return state.tokens.access_token;
    }

    if (!state.tokens.refresh_token) {
      clearTokens();
      return null;
    }

    const refreshResponse = await fetch(state.discovery.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: AUTH_CONFIG.clientId,
        refresh_token: state.tokens.refresh_token,
      }),
    });

    if (!refreshResponse.ok) {
      clearTokens();
      throw new Error("La sesion expiro. Volve a iniciar sesion.");
    }

    state.tokens = await refreshResponse.json();
    persistTokenSet(state.tokens);
    return state.tokens.access_token;
  }

  async function apiFetch(path, init = {}) {
    const accessToken = await ensureFreshToken();
    if (!accessToken) {
      throw new Error("No hay sesion activa.");
    }

    const tenantHostname = tenant.hostnames?.[0] || window.location.hostname;
    const headers = {
      ...(init.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      "X-OpenHealth-Tenant": tenantHostname,
    };

    if (init.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${AUTH_CONFIG.apiBaseUrl}${path}`, {
      ...init,
      headers,
    });

    if (response.status === 401) {
      clearTokens();
      throw new Error("La sesion ya no es valida.");
    }

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = await response.json();
        detail = body.detail || JSON.stringify(body);
      } catch {
        // keep default status text
      }
      throw new Error(detail);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  function isAuthenticated() {
    return Boolean(state.actor && state.tokens);
  }

  function hasRole(role) {
    return Boolean(state.actor && state.actor.roles.includes(role));
  }

  function hasAnyRole(roles) {
    return Boolean(state.actor && state.actor.roles.some((role) => roles.includes(role)));
  }

  function renderSignedOutChrome(elements) {
    if (elements.loginButton) {
      elements.loginButton.classList.remove("hidden");
    }
    if (elements.logoutButton) {
      elements.logoutButton.classList.add("hidden");
    }
    if (elements.moduleNav) {
      elements.moduleNav.classList.add("hidden");
      elements.moduleNav.innerHTML = "";
    }
    renderTenantChrome(elements);
  }

  function renderSignedInChrome(elements) {
    if (!state.actor) {
      renderSignedOutChrome(elements);
      return;
    }

    renderTenantChrome(elements);
    if (elements.loginButton) {
      elements.loginButton.classList.add("hidden");
    }
    if (elements.logoutButton) {
      elements.logoutButton.classList.remove("hidden");
    }
    if (elements.userName) {
      elements.userName.textContent = state.actor.username;
    }
    if (elements.userMeta) {
      elements.userMeta.textContent = `${state.actor.tenant_name} | actor ${state.actor.actor_id}`;
    }
    if (elements.roleList) {
      elements.roleList.innerHTML = state.actor.roles.map(renderRolePill).join("");
    }
    if (elements.moduleNav) {
      elements.moduleNav.classList.add("hidden");
      elements.moduleNav.innerHTML = "";
    }
  }

  function renderTenantChrome(elements) {
    applyTenantBrand();
    document.title = `${tenant.shortName} | ${currentModule.label}`;
    document.querySelectorAll("[data-tenant-name]").forEach((element) => {
      element.textContent = tenant.shortName;
    });
    document.querySelectorAll("[data-tenant-logo]").forEach(renderTenantLogo);
    if (elements.tenantBadge) {
      elements.tenantBadge.textContent =
        tenant.kind === "clinic" ? `${tenant.shortName} | Espacio institucional` : "Tenant base de plataforma";
    }
    if (elements.tenantName) {
      elements.tenantName.textContent = tenant.shortName;
    }
    if (elements.tenantSupport) {
      elements.tenantSupport.textContent = tenant.supportEmail;
    }
  }

  function applyTenantBrand() {
    document.documentElement.dataset.tenant = tenant.id;
  }

  function renderTenantLogo(element) {
    const brand = tenant.brand || {};
    if (brand.logoUrl) {
      element.innerHTML = `<img src="${escapeHtml(brand.logoUrl)}" alt="">`;
      return;
    }
    element.textContent = brand.mark || tenant.shortName.slice(0, 2).toUpperCase();
  }

  async function logout() {
    const idToken = state.tokens?.id_token;
    clearTokens();
    renderSignedOutChrome({});

    const logoutUrl = new URL(state.discovery.end_session_endpoint);
    logoutUrl.searchParams.set(
      "post_logout_redirect_uri",
      `${window.location.origin}${currentModule.href}`,
    );
    logoutUrl.searchParams.set("client_id", AUTH_CONFIG.clientId);
    if (idToken) {
      logoutUrl.searchParams.set("id_token_hint", idToken);
    }
    window.location.assign(logoutUrl.toString());
  }

  function clearTokens() {
    sessionStorage.removeItem(STORAGE_KEYS.tokenSet);
    localStorage.removeItem(STORAGE_KEYS.tokenSet);
    clearPendingLogin();
    state.actor = null;
    state.tokens = null;
  }

  function syncTokensFromStorage() {
    state.tokens = readTokenSet();
  }

  return {
    apiFetch,
    bootstrap,
    clearTokens,
    hasAnyRole,
    hasRole,
    isAuthenticated,
    logout,
    module: currentModule,
    tenant,
    renderSignedInChrome,
    renderSignedOutChrome,
    startLogin,
    state,
  };
}

function renderRolePill(role) {
  return `<span class="role-pill">${escapeHtml(humanizeRole(role))}</span>`;
}

function humanizeRole(role) {
  const labels = {
    admin: "IT administrador",
    admission: "Admision",
    auditor: "Auditoria",
    billing: "Facturacion",
    doctor: "Medico",
    medical_auditor: "Auditoria medica",
    support: "Soporte",
  };
  return labels[role] || role;
}

function currentRedirectUri() {
  return `${window.location.origin}${window.location.pathname}`;
}

function clearPendingLogin() {
  sessionStorage.removeItem(STORAGE_KEYS.authState);
  sessionStorage.removeItem(STORAGE_KEYS.codeVerifier);
  sessionStorage.removeItem(STORAGE_KEYS.returnTo);
  localStorage.removeItem(STORAGE_KEYS.authState);
  localStorage.removeItem(STORAGE_KEYS.codeVerifier);
  localStorage.removeItem(STORAGE_KEYS.returnTo);
}

function persistTokenSet(tokenSet) {
  sessionStorage.setItem(STORAGE_KEYS.tokenSet, JSON.stringify(tokenSet));
}

function readTokenSet() {
  const raw = sessionStorage.getItem(STORAGE_KEYS.tokenSet);
  localStorage.removeItem(STORAGE_KEYS.tokenSet);
  return raw ? JSON.parse(raw) : null;
}

function decodeJwt(token) {
  const [, payload] = token.split(".");
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return JSON.parse(atob(padded));
}

async function pkceChallenge(verifier) {
  const bytes = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return base64UrlEncode(new Uint8Array(hash));
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(length) {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (value) => charset[value % charset.length]).join("");
}

export function optionalValue(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function humanizeError(error) {
  return error instanceof Error ? error.message : "Paso algo inesperado.";
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

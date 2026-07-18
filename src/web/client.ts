import { passkeyClient } from "@better-auth/passkey/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/client";

const auth = createAuthClient({ plugins: [oauthProviderClient(), passkeyClient()] });

interface PublicConfig {
  appName: string;
  turnstileEnabled: boolean;
  turnstileSiteKey?: string;
}

interface PasskeyCredential {
  credentialID: string;
  createdAt?: string;
}

let publicConfigPromise: Promise<PublicConfig> | undefined;

function getPublicConfig(): Promise<PublicConfig> {
  publicConfigPromise ??= fetch("/api/config").then(async (response) => {
    if (!response.ok) throw new Error("Unable to load public configuration");
    return await response.json() as PublicConfig;
  });
  return publicConfigPromise;
}

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing element: ${id}`);
  return value as T;
}

async function loadTurnstile(): Promise<void> {
  if (window.turnstile) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile failed to load"));
    document.head.appendChild(script);
  });
}

function setStatus(message: string, error = false): void {
  const status = element<HTMLOutputElement>("status");
  status.textContent = message;
  status.dataset.error = String(error);
}

function sharedApplicationName(): string | undefined {
  const query = new URLSearchParams(window.location.search);
  const name = query.get("application_name") ?? query.get("app_name");
  if (name?.trim()) return name.trim();

  const target = query.get("redirect_url") ?? query.get("return_to");
  if (!target) return undefined;
  try {
    return new URL(target).hostname;
  } catch {
    return undefined;
  }
}

async function credentialDetails(credentialID?: string): Promise<PasskeyCredential | undefined> {
  if (!credentialID) return undefined;
  try {
    const response = await fetch("/api/auth/passkey/list-user-passkeys");
    if (!response.ok) return undefined;
    const passkeys = await response.json() as PasskeyCredential[];
    return passkeys.find((item) => item.credentialID === credentialID);
  } catch {
    return undefined;
  }
}

function setSignedInDetail(name: string, value?: string): void {
  element<HTMLElement>(`signed-in-${name}-row`).hidden = !value;
  if (value) element<HTMLElement>(`signed-in-${name}`).textContent = value;
}

function isoDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString().slice(0, 10);
}

async function showSignedInState(credentialID?: string): Promise<void> {
  const [{ appName }, session, credential] = await Promise.all([
    getPublicConfig(),
    auth.getSession(),
    credentialDetails(credentialID),
  ]);
  const email = session.data?.user.email;
  element<HTMLElement>("sign-in-title").textContent = `Signed in to ${appName}`;
  element<HTMLElement>("signed-in-email").textContent = email ?? "Unknown";
  setSignedInDetail("created-at", isoDate(credential?.createdAt));
  element<HTMLElement>("sign-in-options").hidden = true;
  element<HTMLElement>("signed-in-options").hidden = false;
}

async function signOut(): Promise<void> {
  const button = element<HTMLButtonElement>("sign-out-action");
  button.disabled = true;
  try {
    await auth.signOut();
    window.location.replace("/");
  } finally {
    button.disabled = false;
  }
}

async function applyBranding(): Promise<void> {
  try {
    const { appName } = await getPublicConfig();
    document.querySelectorAll<HTMLElement>("[data-app-name]").forEach((node) => {
      node.textContent = appName;
    });
    document.querySelectorAll<HTMLElement>("[data-login-target]").forEach((node) => {
      node.textContent = sharedApplicationName() ?? appName;
    });
    const pageTitle = document.body.dataset.page === "invite" ? "Accept invitation" : "Sign in";
    document.title = `${pageTitle} — ${appName}`;
  } catch {
    // Keep the static fallback branding when public configuration is unavailable.
  }
}

declare global {
  interface Window {
    turnstile?: {
      render(target: string | HTMLElement, options: {
        sitekey: string;
        action: string;
        size?: "normal" | "compact" | "flexible";
        theme?: "light" | "dark" | "auto";
        callback?: (token: string) => void;
        "error-callback"?: () => void;
        "expired-callback"?: () => void;
      }): string;
      getResponse(widgetId?: string): string;
      reset(widgetId?: string): void;
    };
  }
}

async function setupInvitationRequest(): Promise<void> {
  const form = document.getElementById("invite-request-form") as HTMLFormElement | null;
  if (!form) return;
  const confirmation = element<HTMLDivElement>("invitation-confirmation");
  const confirmationEmail = element<HTMLElement>("invitation-confirmation-email");
  const status = element<HTMLOutputElement>("invite-request-status");
  const showConfirmation = (email: string): void => {
    status.textContent = "";
    confirmationEmail.textContent = email;
    form.classList.add("invite-request-form--hidden");
    form.setAttribute("aria-hidden", "true");
    form.setAttribute("inert", "");
    confirmation.hidden = false;
  };
  const config = await getPublicConfig();
  let widgetId: string | undefined;
  let pendingEmail = "";
  let submitting = false;
  const submitInvitation = async (turnstileToken: string): Promise<void> => {
    if (submitting) return;
    submitting = true;
    status.textContent = "Submitting…";
    try {
      await fetch("/api/invitations/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: pendingEmail, turnstileToken }),
      });
      showConfirmation(pendingEmail);
    } catch {
      showConfirmation(pendingEmail);
    } finally {
      submitting = false;
      if (widgetId) window.turnstile?.reset(widgetId);
    }
  };
  if (!config.turnstileEnabled || !config.turnstileSiteKey) {
    document.getElementById("turnstile-widget")?.remove();
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    pendingEmail = element<HTMLInputElement>("invite-email").value.trim();
    if (!config.turnstileEnabled || !config.turnstileSiteKey) {
      await submitInvitation("");
      return;
    }
    const existingToken = widgetId ? window.turnstile?.getResponse(widgetId) ?? "" : "";
    if (existingToken) {
      await submitInvitation(existingToken);
      return;
    }
    if (widgetId) {
      status.textContent = "Complete the verification to request an invitation.";
      return;
    }
    status.textContent = "Loading verification…";
    try {
      await loadTurnstile();
      widgetId = window.turnstile?.render("#turnstile-widget", {
        sitekey: config.turnstileSiteKey,
        action: "turnstile-spin-v1",
        size: "flexible",
        theme: "light",
        callback: (token) => void submitInvitation(token),
        "error-callback": () => {
          status.textContent = "Verification failed. Try again or sign in with your passkey.";
        },
        "expired-callback": () => {
          status.textContent = "Verification expired. Complete it again to request an invitation.";
        },
      });
      status.textContent = "Complete the verification to request an invitation.";
    } catch {
      status.textContent = "Verification could not load. Try again or sign in with your passkey.";
    }
  });
}

async function signIn(): Promise<void> {
  setStatus("Waiting for your passkey…");
  const result = await auth.signIn.passkey({ returnWebAuthnResponse: true });
  if (!result || result.error) {
    setStatus(result.error.message ?? "Passkey sign-in failed.", true);
    return;
  }
  const credentialID = "webauthn" in result ? result.webauthn.response.id : undefined;
  await showSignedInState(credentialID);
}

async function register(): Promise<void> {
  const match = /^\/invite\/([^/]+)$/.exec(window.location.pathname);
  const encodedToken = match?.[1];
  let token: string | null = null;
  if (encodedToken) {
    try {
      token = decodeURIComponent(encodedToken);
    } catch {
      // Treat malformed path encoding as an incomplete invitation link.
    }
  }
  if (!token) {
    setStatus("This invitation link is incomplete.", true);
    return;
  }
  const finish = (): void => {
    window.location.replace("/?registered=1");
  };
  const registrationComplete = async (): Promise<boolean> => {
    try {
      const response = await fetch(`/api/invitations/status?token=${encodeURIComponent(token)}`, {
        headers: { accept: "application/json" },
      });
      const body = await response.json() as { complete?: boolean };
      return response.ok && body.complete === true;
    } catch {
      return false;
    }
  };
  if (await registrationComplete()) {
    finish();
    return;
  }
  setStatus("Creating your passkey…");
  const result = await auth.passkey.addPasskey({
    context: token,
  });
  if (result?.error) {
    if (await registrationComplete()) {
      finish();
      return;
    }
    setStatus(result.error.message ?? "Passkey registration failed.", true);
    return;
  }
  finish();
}

const action = document.body.dataset.page;
const button = element<HTMLButtonElement>("primary-action");
void applyBranding();
button.onclick = () => void (action === "invite" ? register() : signIn());
if (action === "sign-in" && new URLSearchParams(window.location.search).get("registered") === "1") {
  setStatus("Passkey created. Sign in to continue.");
}
if (action === "sign-in") {
  element<HTMLButtonElement>("sign-out-action").onclick = () => void signOut();
  void setupInvitationRequest();
}

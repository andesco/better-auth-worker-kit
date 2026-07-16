import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/client";

const auth = createAuthClient({ plugins: [passkeyClient()] });

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing element: ${id}`);
  return value as T;
}

function setStatus(message: string, error = false): void {
  const status = element<HTMLOutputElement>("status");
  status.textContent = message;
  status.dataset.error = String(error);
}

declare global {
  interface Window {
    turnstile?: {
      render(target: string | HTMLElement, options: {
        sitekey: string;
        action: string;
        size?: "normal" | "compact" | "flexible";
        theme?: "light" | "dark" | "auto";
      }): string;
      getResponse(widgetId?: string): string;
      reset(widgetId?: string): void;
    };
  }
}

async function setupInvitationRequest(): Promise<void> {
  const form = document.getElementById("invite-request-form") as HTMLFormElement | null;
  if (!form) return;
  const configResponse = await fetch("/api/config");
  const config = await configResponse.json() as { turnstileSiteKey: string };
  while (!window.turnstile) await new Promise((resolve) => window.setTimeout(resolve, 50));
  const widgetId = window.turnstile.render("#turnstile-widget", {
    sitekey: config.turnstileSiteKey,
    action: "turnstile-spin-v1",
    size: "flexible",
    theme: "light",
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = element<HTMLOutputElement>("invite-request-status");
    const email = element<HTMLInputElement>("invite-email").value;
    const turnstileToken = window.turnstile?.getResponse(widgetId) ?? "";
    status.textContent = "Submitting…";
    try {
      const result = await fetch("/api/invitations/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, turnstileToken }),
      });
      const body = await result.json() as { message?: string };
      status.textContent = body.message ?? "If authorized, we'll send an invitation email.";
      form.reset();
    } catch {
      status.textContent = "If authorized, we'll send an invitation email.";
    } finally {
      window.turnstile?.reset(widgetId);
    }
  });
}

async function signIn(autoFill = false): Promise<void> {
  if (!autoFill) setStatus("Waiting for your passkey…");
  const result = await auth.signIn.passkey({ autoFill });
  if (result?.error) {
    if (!autoFill) setStatus(result.error.message ?? "Passkey sign-in failed.", true);
    return;
  }
  setStatus("Signed in. Continuing…");
  window.location.reload();
}

async function setupConditionalSignIn(): Promise<void> {
  if (typeof PublicKeyCredential === "undefined" ||
      typeof PublicKeyCredential.isConditionalMediationAvailable !== "function") return;
  if (!(await PublicKeyCredential.isConditionalMediationAvailable())) return;
  await signIn(true);
}

async function register(): Promise<void> {
  const token = new URLSearchParams(window.location.search).get("token");
  if (!token) {
    setStatus("This invitation link is incomplete.", true);
    return;
  }
  const finish = (): void => {
    window.location.replace("/sign-in.html?registered=1");
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
button.onclick = () => void (action === "invite" ? register() : signIn());
if (action === "sign-in" && new URLSearchParams(window.location.search).get("registered") === "1") {
  setStatus("Passkey created. Sign in to continue.");
}
if (action === "sign-in") {
  void setupInvitationRequest();
  void setupConditionalSignIn();
}

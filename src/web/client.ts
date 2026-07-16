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

async function signIn(): Promise<void> {
  setStatus("Waiting for your passkey…");
  const result = await auth.signIn.passkey();
  if (result?.error) {
    setStatus(result.error.message ?? "Passkey sign-in failed.", true);
    return;
  }
  setStatus("Signed in. Continuing…");
  window.location.reload();
}

async function register(): Promise<void> {
  const token = new URLSearchParams(window.location.search).get("token");
  if (!token) {
    setStatus("This invitation link is incomplete.", true);
    return;
  }
  setStatus("Creating your passkey…");
  const result = await auth.passkey.addPasskey({
    name: "Primary passkey",
    context: token,
  });
  if (result?.error) {
    setStatus(result.error.message ?? "Passkey registration failed.", true);
    return;
  }
  setStatus("Passkey created. Sign in to finish.");
  const button = element<HTMLButtonElement>("primary-action");
  button.textContent = "Sign in with passkey";
  button.onclick = () => void signIn();
}

const action = document.body.dataset.page;
const button = element<HTMLButtonElement>("primary-action");
button.onclick = () => void (action === "invite" ? register() : signIn());

import type { Auth } from "./auth";
import { accessPolicyAllowsEmail } from "./access-policy";
import { appName, requestOrigin } from "./constants";
import { issueInvitation } from "./invitations";

const GENERIC_MESSAGE = "If authorized, we'll send an invitation email.";

function response(): Response {
  return Response.json({ message: GENERIC_MESSAGE }, {
    status: 202,
    headers: { "cache-control": "no-store" },
  });
}

async function readRequest(request: Request): Promise<{ email: string; turnstileToken: string } | null> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 4096 || !request.headers.get("content-type")?.includes("application/json")) return null;
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
  const turnstileToken = typeof value.turnstileToken === "string" ? value.turnstileToken : "";
  if (email.length > 254 || !/^\S+@\S+\.\S+$/u.test(email)) return null;
  return { email, turnstileToken };
}

async function verifyTurnstile(env: Env, token: string, request: Request): Promise<boolean> {
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  const remoteIp = request.headers.get("cf-connecting-ip");
  if (remoteIp) body.set("remoteip", remoteIp);
  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  if (!result.ok) return false;
  const value: unknown = await result.json();
  return Boolean(value && typeof value === "object" && "success" in value && value.success === true);
}

async function processRequest(request: Request, env: Env, auth: Auth, email: string): Promise<void> {
  try {
    if (!(await accessPolicyAllowsEmail(env, email))) return;
    const invitation = await issueInvitation(auth, env.DB, email, 7);
    if (!invitation) return;
    const url = `${requestOrigin(request)}/invite/${invitation.token}`;
    const name = appName(env);
    await env.EMAIL.send({
      to: email,
      from: { name, email: env.INVITATION_FROM },
      subject: `Your ${name} invitation`,
      text: `You have been invited to register a passkey.\n\nOpen this single-use link within 7 days:\n${url}\n\nIf you did not request this invitation, you can ignore this email.`,
      html: `<p>You have been invited to register a passkey.</p><p><a href="${url}">Create your passkey</a></p><p>This single-use link expires in 7 days. If you did not request it, you can ignore this email.</p>`,
    });
  } catch (error) {
    console.error(JSON.stringify({
      message: "invitation request processing failed",
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

export async function handleInvitationRequest(
  request: Request,
  env: Env,
  auth: Auth,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const input = await readRequest(request);
  if (!input) return response();

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const rate = await env.INVITE_RATE_LIMITER.limit({ key: ip });
  const turnstileEnabled = env.TURNSTILE_ENABLED === "true";
  if (!rate.success ||
      (turnstileEnabled &&
        (!input.turnstileToken || !(await verifyTurnstile(env, input.turnstileToken, request))))) {
    return response();
  }

  ctx.waitUntil(processRequest(request, env, auth, input.email));
  return response();
}

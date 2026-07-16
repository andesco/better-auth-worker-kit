import { createAuth } from "./auth";
import { handleAdmin } from "./admin-api";
import { ADMIN_BASE_PATH } from "./constants";

function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { location, "cache-control": "no-store" },
  });
}

function securePage(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set(
    "content-security-policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  headers.set("permissions-policy", "publickey-credentials-create=(self), publickey-credentials-get=(self)");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const auth = createAuth(env);

    try {
      if (url.pathname === "/health") return Response.json({ ok: true });
      if (url.pathname === "/") return redirect("/sign-in");
      if (url.pathname === "/sign-in") return redirect(`/sign-in.html${url.search}`);
      if (url.pathname === "/consent") {
        return new Response("Consent is disabled for the trusted Cloudflare Access client.", {
          status: 403,
          headers: { "cache-control": "no-store" },
        });
      }
      if (url.pathname.startsWith("/invite/")) {
        const token = url.pathname.slice("/invite/".length);
        if (!token || token.includes("/")) return new Response("Not found", { status: 404 });
        return redirect(`/invite.html?token=${encodeURIComponent(token)}`);
      }
      if (url.pathname.startsWith(ADMIN_BASE_PATH)) return await handleAdmin(request, env, auth);
      if (url.pathname === "/.well-known/openid-configuration") {
        return Response.json(await auth.api.getOpenIdConfig(), {
          headers: { "cache-control": "public, max-age=300" },
        });
      }
      if (
        url.pathname === "/.well-known/oauth-authorization-server" ||
        url.pathname === "/.well-known/oauth-authorization-server/api/auth"
      ) {
        return Response.json(await auth.api.getOAuthServerConfig(), {
          headers: { "cache-control": "public, max-age=300" },
        });
      }
      if (url.pathname.startsWith("/api/auth/") || url.pathname.startsWith("/.well-known/")) {
        return await auth.handler(request);
      }
      const asset = await env.ASSETS.fetch(request);
      return url.pathname === "/sign-in.html" || url.pathname === "/invite.html"
        ? securePage(asset)
        : asset;
    } catch (error) {
      const details = error instanceof Response
        ? { kind: "Response", status: error.status, body: await error.clone().text() }
        : error instanceof Error
          ? {
              kind: error.name,
              message: error.message,
              stack: error.stack,
              body: "body" in error ? error.body : undefined,
              status: "status" in error ? error.status : undefined,
              statusCode: "statusCode" in error ? error.statusCode : undefined,
            }
          : { kind: typeof error, value: String(error) };
      console.error(JSON.stringify({
        message: "request failed",
        path: url.pathname,
        error: details,
      }));
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;

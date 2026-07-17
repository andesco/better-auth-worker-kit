export const DEFAULT_APP_NAME = "Cloudflare Access Passkeys Kit";
export const AUTH_BASE_PATH = "/api/auth";
export const ADMIN_BASE_PATH = "/__admin/v1";

export function appName(env: Env): string {
  return env.APP_NAME?.trim() || DEFAULT_APP_NAME;
}

export function requestOrigin(request: Request): string {
  return new URL(request.url).origin;
}

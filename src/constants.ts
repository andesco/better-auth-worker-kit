export const APP_NAME = "Better Auth Worker Kit";
export const AUTH_BASE_PATH = "/api/auth";
export const ADMIN_BASE_PATH = "/__admin/v1";

export function requestOrigin(request: Request): string {
  return new URL(request.url).origin;
}

import { oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { jwt } from "better-auth/plugins";
import { APP_NAME, ORIGIN, RP_ID } from "./constants";
import { consumeInvitation, resolveInvitation } from "./invitations";

export function createAuth(env: Env) {
  return betterAuth({
    appName: APP_NAME,
    baseURL: ORIGIN,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    trustedOrigins: [ORIGIN],
    emailAndPassword: { enabled: false },
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: true,
    },
    plugins: [
      jwt(),
      passkey({
        rpID: RP_ID,
        rpName: APP_NAME,
        origin: ORIGIN,
        authenticatorSelection: {
          residentKey: "required",
          requireResidentKey: true,
          userVerification: "required",
        },
        registration: {
          requireSession: false,
          resolveUser: async ({ context }) => {
            const invitation = await resolveInvitation(env.DB, context);
            return {
              id: invitation.user_id,
              name: invitation.email,
              displayName: invitation.email,
            };
          },
          afterVerification: async ({ context, verification, user }) => {
            if (!verification.registrationInfo?.userVerified) {
              throw new APIError("UNAUTHORIZED", { message: "User verification is required" });
            }
            if (!context) {
              throw new APIError("FORBIDDEN", { message: "A valid invitation is required" });
            }
            const invitation = await consumeInvitation(env.DB, context);
            if (invitation.user_id !== user.id) {
              throw new APIError("FORBIDDEN", { message: "Invitation does not match this user" });
            }
          },
        },
        authentication: {
          afterVerification: ({ verification }) => {
            if (!verification.authenticationInfo.userVerified) {
              throw new APIError("UNAUTHORIZED", { message: "User verification is required" });
            }
          },
        },
      }),
      oauthProvider({
        loginPage: "/sign-in",
        consentPage: "/consent",
        scopes: ["openid", "email", "profile"],
        grantTypes: ["authorization_code"],
        allowDynamicClientRegistration: false,
        allowUnauthenticatedClientRegistration: false,
        silenceWarnings: {
          oauthAuthServerConfig: true,
          openidConfig: true,
        },
        clientReference: ({ user }) => user?.email.startsWith("_system.")
          ? "cloudflare-access"
          : undefined,
        clientPrivileges: ({ user }) => user?.email.startsWith("_system.") ?? false,
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

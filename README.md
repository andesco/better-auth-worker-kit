# Better Auth Worker Kit

An opinionated implementation of [Better Auth](https://www.better-auth.com/) for Cloudflare Workers.

The initial focus is a small identity provider for Cloudflare Access: it runs on Workers, stores relational authentication state in D1, uses passkeys for sign-in, and keeps administration in a Bun CLI instead of a browser dashboard.

This is an independent community project. It is not an official Better Auth or Cloudflare project.

## Initial focus

The included deployment profile is intentionally narrow:

- **Cloudflare Access:** Better Auth acts as an OAuth 2.1/OpenID Connect provider, with one confidential client provisioned for a generic Cloudflare Access identity-provider integration.
- **Workers + D1:** the authentication server runs in a Cloudflare Worker, while users, sessions, passkeys, invitations, OAuth clients, consents, and signing data live in D1.
- **Passkeys:** passkeys are the only enabled interactive sign-in method. Enrollment requires a single-use invitation, resident credentials, and verified user presence.
- **CLI administration:** migrations, invitations, recovery, and OIDC client provisioning are performed with the Bun CLI. There is no administration dashboard.

These are implementation defaults, not limitations of Better Auth or the project architecture.

## Designed to extend

Better Auth remains the authentication core. Additional Better Auth capabilities can be introduced by changing the server plugins and configuration, adding any required external services, and migrating D1.

Possible extensions include:

- magic links or email OTP;
- social OAuth providers;
- usernames and passwords;
- multi-factor authentication;
- organizations and roles;
- additional OIDC clients or relying parties;
- a separately protected administration application.

Enabling another sign-in method changes the security and recovery model. For example, email-based authentication requires a transactional email provider and makes control of the email account part of the trust boundary. Worker-runtime compatibility should also be verified for every new plugin and dependency.

The current boundaries are easy to locate:

| Concern | Location |
|---|---|
| Better Auth methods and plugins | `src/auth.ts` |
| Worker routing and security headers | `src/index.ts` |
| D1-backed invitations | `src/invitations.ts` |
| Administrative command channel | `src/admin-api.ts` |
| Bun administration CLI | `src/admin.ts` |
| Browser sign-in and enrollment UX | `src/web/client.ts`, `public/` |

## Current security profile

- Email/password and social providers are disabled.
- Passkey enrollment requires a cryptographically random, expiring, single-use invitation.
- Resident credentials and user verification are required. The WebAuthn verification result is checked explicitly for the UV flag.
- Dynamic OAuth client registration and user-managed OAuth client CRUD are disabled.
- The administration channel requires a separate high-entropy bearer token and has no browser UI.
- Exactly one OAuth client can be provisioned. It is configured for Cloudflare Access, requires PKCE, skips consent, and supports only the authorization-code grant.
- Lost-passkey recovery is destructive and CLI-only: every existing session and passkey is revoked before a new invitation is issued.

D1 is the system of record. KV is not required for correctness. It can be added later as Better Auth secondary storage for cacheable, short-lived data, but should not replace D1 for relational authentication state.

## Local development

Requirements: Bun and a Cloudflare account authenticated with Wrangler.

```sh
bun install
cp .dev.vars.example .dev.vars
bun run dev
```

In another terminal, initialize the local D1 database:

```sh
AUTH_ADMIN_URL=http://localhost:8787 \
AUTH_ADMIN_TOKEN=your-local-admin-token \
bun run admin migrate
```

The `.dev.vars.example` file contains non-production placeholders. The working `.dev.vars` file is gitignored; replace both values locally.

## Production setup

The checked-in deployment example uses `auth.andrewe.dev`. Change the custom domain, public origin, RP ID, and application name before deploying another instance.

1. Create D1 and copy the returned database ID into `wrangler.jsonc`:

```sh
bunx wrangler d1 create better-auth-worker-kit
```

2. Configure both secrets interactively. Use different random values of at least 32 bytes:

```sh
bunx wrangler secret put BETTER_AUTH_SECRET
bunx wrangler secret put ADMIN_TOKEN
```

3. Deploy, then run the schema migration through the Bun CLI:

```sh
bun run deploy
AUTH_ADMIN_TOKEN='your-production-admin-token' bun run admin migrate
```

4. Provision the initial OIDC client. Replace `your-team` with the Cloudflare Zero Trust team name, not the account name:

```sh
AUTH_ADMIN_TOKEN='your-production-admin-token' \
bun run admin client provision your-team
```

Save the returned client secret immediately; Better Auth stores only its hash.

## Cloudflare Access configuration

In Zero Trust, add a generic OpenID Connect identity provider with the values returned by `client provision` and these endpoints:

| Field | Value |
|---|---|
| Authorization URL | `https://auth.andrewe.dev/api/auth/oauth2/authorize` |
| Token URL | `https://auth.andrewe.dev/api/auth/oauth2/token` |
| Certificate/JWKS URL | `https://auth.andrewe.dev/api/auth/jwks` |
| Discovery URL | `https://auth.andrewe.dev/.well-known/openid-configuration` |
| Scopes | `openid email profile` |
| Email claim | `email` |
| PKCE | Enabled |

The registered callback is:

```text
https://<your-team>.cloudflareaccess.com/cdn-cgi/access/callback
```

## CLI administration

All commands use `AUTH_ADMIN_URL` (default `https://auth.andrewe.dev`) and require `AUTH_ADMIN_TOKEN`.

```sh
# Apply Better Auth and kit-specific D1 migrations
bun run admin migrate

# Create a seven-day invitation
bun run admin invite create person@example.com

# Create a shorter invitation
bun run admin invite create person@example.com --days 2

# List and revoke invitations
bun run admin invite list
bun run admin invite revoke <invitation-id>

# Lost-passkey recovery; revokes every passkey and session first
bun run admin user recover person@example.com --days 1

# Provision and inspect the initial OIDC client
bun run admin client provision <cloudflare-team-name>
bun run admin client show
```

Invitation URLs are credentials until consumed. Send them over a secure channel and avoid placing them in tickets, logs, or chat archives.

The CLI communicates with a narrow authenticated command channel under `/__admin/v1`. “CLI-only” means the project exposes no browser administration interface; the server-side command channel still exists and must be protected with `ADMIN_TOKEN` and HTTPS.

## Verification

```sh
bun run check
bun test
```

`bun run check` builds the browser client, verifies generated Worker binding types, type-checks TypeScript, and runs a Wrangler deployment dry run.

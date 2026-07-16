# Better Auth Worker Kit

**Better Auth Worker Kit** adds passkey authentication to [Cloudflare&nbsp;Access][access] by running [Better&nbsp;Auth][better-auth] as a small OpenID Connect identity provider on [Cloudflare&nbsp;Workers][workers]. Authentication state is stored in [Cloudflare&nbsp;D1][d1], and administration remains CLI-only.

Cloudflare Access is still the access-control layer. It continues to handle application policies, permitted email addresses, sessions, identity-provider selection, and any OTP or MFA requirements. This Worker exists to add a passkey-capable primary sign-in option that Access does not provide on its own.

This is an independent community project. It is not an official Better Auth or Cloudflare project.

## Deploy to Cloudflare

### Cloudflare Dashboard

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/andesco/better-auth-worker-kit)

Workers & Pages → [**Create application**](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create/deploy-to-workers): Continue with GitHub: Clone a public repository via Git URL:

```text
https://github.com/andesco/better-auth-worker-kit
```

Cloudflare automatically provisions and binds D1 from the draft `DB` binding in `wrangler.jsonc`. The deploy script applies the included schema migration immediately after the Worker is created; do not create a database manually or add an account-specific database ID to the repository.

During setup, provide two different high-entropy secrets:

- `BETTER_AUTH_SECRET`: signs Better Auth cookies and tokens.
- `ADMIN_TOKEN`: authenticates the Bun administration CLI.

Generate each value independently with `openssl rand -hex 32`.

### Wrangler CLI

```bash
git clone https://github.com/andesco/better-auth-worker-kit.git
cd better-auth-worker-kit
bun install
bunx wrangler whoami
bun run deploy
bunx wrangler secret put BETTER_AUTH_SECRET
bunx wrangler secret put ADMIN_TOKEN
```

The first deploy creates the Worker, automatically provisions D1, and then applies `migrations/0001_initial.sql`. Adding each secret creates a new production Worker version.

### Connect Cloudflare Access

Find the Zero Trust team name under Settings → Custom Pages → Team domain, then provision the one OIDC client:

```bash
AUTH_ADMIN_URL=https://<your-worker-origin> \
AUTH_ADMIN_TOKEN='<your-admin-token>' \
bun run admin client provision <cloudflare-team-name>
```

Save the returned client secret immediately; Better Auth stores only its hash.

In Zero Trust, go to Integrations → Identity providers → Add new identity provider → OpenID Connect. Use the returned client ID and secret with:

| Field | Value |
|---|---|
| Authorization URL | `https://<your-worker-origin>/api/auth/oauth2/authorize` |
| Token URL | `https://<your-worker-origin>/api/auth/oauth2/token` |
| Certificate/JWKS URL | `https://<your-worker-origin>/api/auth/jwks` |
| Discovery URL | `https://<your-worker-origin>/.well-known/openid-configuration` |
| Scopes | `openid email profile` |
| Email claim | `email` |
| PKCE | Enabled |

The registered callback is:

```text
https://<cloudflare-team-name>.cloudflareaccess.com/cdn-cgi/access/callback
```

Access policies continue to decide which emails and identities may reach each protected application. This identity provider only authenticates an invited user with a passkey and supplies the resulting OIDC identity to Access.

### Suggested Prompt

```text
Use authenticated Wrangler CLI and Cloudflare API or MCP to deploy this repository as a passkey identity provider for Cloudflare Access:

https://github.com/andesco/better-auth-worker-kit

Clone the repository, run bun install, verify authentication with bunx wrangler whoami, and deploy the included Worker with bun run deploy. Let Wrangler automatically provision and bind D1 from the draft DB binding and apply the included migrations. Do not manually create D1, hardcode an account ID or database ID, or rebuild the Worker from scratch.

Create different 32-byte BETTER_AUTH_SECRET and ADMIN_TOKEN values and configure them as Worker secrets without printing or committing them. Discover the deployed Worker origin and the existing Cloudflare Access team name. Use the repository's Bun admin CLI to provision its single OIDC client, then configure a generic OpenID Connect identity provider in Cloudflare Access with PKCE enabled and the openid, email, and profile scopes.

Cloudflare Access remains responsible for application policies, permitted emails, OTP, sessions, and MFA requirements. Do not add email OTP, magic links, password authentication, email allowlists, or MFA to the Worker. Its purpose is to add passkey primary authentication to Access.

Ask the user which email identity to invite before creating the first invitation. After enrollment, verify OIDC discovery, JWKS, the Access authorization redirect, passkey sign-in, and access to a protected application.
```

## Responsibility Boundary

| Better Auth Worker Kit | Cloudflare Access |
|---|---|
| Passkey registration and verification | Protected application policies |
| Invitation-gated identity creation | Permitted emails and domains |
| OIDC authorization, tokens, claims, and JWKS | OTP and identity-provider selection |
| Passkey/session recovery through the CLI | MFA requirements and application sessions |
| D1 persistence for the passkey identity provider | Final allow/deny decision for each application |

The project is deliberately not a general-purpose replacement for Access authentication features. Relevant future work is passkey-focused: stronger enrollment policy, authenticator metadata or attestation controls, additional claims for Access policy evaluation, improved recovery operations, and better CLI ergonomics.

## Security Profile

- Passkeys are the only enabled interactive sign-in method.
- Enrollment requires a cryptographically random, expiring, single-use invitation.
- Resident credentials and user verification are required. The WebAuthn verification result is checked explicitly for the UV flag.
- Dynamic OAuth client registration and user-managed OAuth client CRUD are disabled.
- Exactly one confidential OIDC client can be provisioned. It requires PKCE, skips consent, and supports only the authorization-code grant.
- Administration requires a separate high-entropy bearer token and exposes no browser dashboard.
- Lost-passkey recovery is destructive and CLI-only: every existing passkey and session is revoked before a new invitation is issued.

D1 is the system of record. KV is not required for correctness and should not replace D1 for relational authentication state.

## CLI Administration

All production commands require `AUTH_ADMIN_URL` and `AUTH_ADMIN_TOKEN`. The CLI communicates with a narrow authenticated command channel under `/__admin/v1`; “CLI-only” means the project exposes no browser administration interface.

```bash
# Apply or reconcile the schema
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

# Provision and inspect the sole OIDC client
bun run admin client provision <cloudflare-team-name>
bun run admin client show
```

Invitation URLs are credentials until consumed. Send them over a secure channel and avoid placing them in tickets, logs, or chat archives.

## Local Development

```bash
bun install
cp .dev.vars.example .dev.vars
bun run dev
```

In another shell:

```bash
AUTH_ADMIN_URL=http://localhost:8787 \
AUTH_ADMIN_TOKEN=your-local-admin-token \
bun run admin migrate
```

The working `.dev.vars` file and Wrangler state are gitignored.

## Verification

```bash
bun run check
bun test
```

`bun run check` builds the browser client, verifies generated Worker binding types, type-checks TypeScript, and runs a Wrangler deployment dry run.

[access]: https://developers.cloudflare.com/cloudflare-one/access-controls/
[better-auth]: https://www.better-auth.com/
[d1]: https://developers.cloudflare.com/d1/
[workers]: https://developers.cloudflare.com/workers/
[wrangler]: https://developers.cloudflare.com/workers/wrangler/

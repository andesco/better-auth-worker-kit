# Security Model

Better Auth Worker Kit has the following security properties:

- Passkeys are the only enabled interactive sign-in method.
- Enrollment requires a cryptographically random, expiring, single-use invitation.
- The public request form always returns the same “If authorized” response. A per-IP rate limiter runs before policy lookup; Turnstile can optionally run there as an additional gate.
- Enrollment eligibility comes directly from one reusable Cloudflare Access Allow policy. Only exact Email selectors are accepted; unsupported policy shapes fail closed.
- Invitation email is transactional, includes HTML and plain-text bodies, and is sent through the native Cloudflare Email Service binding.
- Resident credentials and user verification are required. The WebAuthn verification result is checked explicitly for the UV flag.
- Sign-in is usernameless and opens the browser or operating system’s account chooser for discoverable passkeys.
- Passkeys are labeled with the policy-authorized invitation email instead of a generic “Primary passkey” name.
- Dynamic OAuth client registration and user-managed OAuth client CRUD are disabled.
- Exactly one confidential OIDC client can be provisioned. It requires PKCE, skips consent, and supports only the authorization-code grant.
- OIDC ID tokens use RS256 because Cloudflare Access does not support Better Auth’s default Ed25519/OKP signing keys. The included migration removes incompatible legacy keys when upgrading an existing deployment so Better Auth can generate an RSA key.
- Administration requires a separate high-entropy bearer token and exposes no browser dashboard.
- Lost-passkey recovery is destructive and CLI-only: every existing passkey and session is revoked before a new invitation is issued.

D1 is the system of record. KV is not required for correctness and should not replace D1 for relational authentication state.

interface EmailRule {
  email: { email: string };
}

interface AccessPolicy {
  decision?: string;
  reusable?: boolean;
  include?: unknown[];
  exclude?: unknown[];
  require?: unknown[];
}

function emailFromRule(rule: unknown): string | null {
  if (!rule || typeof rule !== "object" || !("email" in rule)) return null;
  const value = (rule as Partial<EmailRule>).email;
  return value && typeof value.email === "string" ? value.email.trim().toLowerCase() : null;
}

export function policyAllowsEmail(policy: AccessPolicy, candidate: string): boolean {
  if (policy.decision !== "allow" || policy.reusable !== true) return false;
  const include = policy.include ?? [];
  const exclude = policy.exclude ?? [];
  const require = policy.require ?? [];
  if (include.length === 0 || require.length !== 0) return false;

  const includedEmails = include.map(emailFromRule);
  const excludedEmails = exclude.map(emailFromRule);
  if (includedEmails.includes(null) || excludedEmails.includes(null)) return false;

  const email = candidate.trim().toLowerCase();
  return includedEmails.includes(email) && !excludedEmails.includes(email);
}

export async function accessPolicyAllowsEmail(env: Env, email: string): Promise<boolean> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}` +
      `/access/policies/${encodeURIComponent(env.ACCESS_POLICY_ID)}`,
    { headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` } },
  );
  if (!response.ok) throw new Error(`Access policy lookup failed with status ${response.status}`);

  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("success" in body) || !("result" in body)) {
    throw new Error("Access policy lookup returned an invalid response");
  }
  const result = body as { success: unknown; result: AccessPolicy };
  if (result.success !== true) throw new Error("Access policy lookup was unsuccessful");
  return policyAllowsEmail(result.result, email);
}

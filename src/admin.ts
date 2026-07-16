const baseUrl = (process.env.AUTH_ADMIN_URL ?? "https://auth.andrewe.dev").replace(/\/$/u, "");
const token = process.env.AUTH_ADMIN_TOKEN;

export {};

function usage(): never {
  console.error(`Usage:
  bun run admin migrate
  bun run admin invite create <email> [--days <1-30>]
  bun run admin invite list
  bun run admin invite revoke <id>
  bun run admin user recover <email> [--days <1-7>]
  bun run admin client provision <cloudflare-team-name>
  bun run admin client show`);
  process.exit(2);
}

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  if (!token) throw new Error("AUTH_ADMIN_TOKEN is required");
  const response = await fetch(`${baseUrl}/__admin/v1${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Server returned ${response.status}: ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body
      ? String(body.error)
      : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return body;
}

function option(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  return index === -1 ? undefined : Bun.argv[index + 1];
}

const args = Bun.argv.slice(2);
let result: unknown;

if (args[0] === "migrate" && args.length === 1) {
  result = await call("/migrate", { method: "POST" });
} else if (args[0] === "invite" && args[1] === "create" && args[2]) {
  const daysValue = option("--days");
  result = await call("/invitations", {
    method: "POST",
    body: JSON.stringify({ email: args[2], days: daysValue ? Number(daysValue) : 7 }),
  });
} else if (args[0] === "invite" && args[1] === "list" && args.length === 2) {
  result = await call("/invitations");
} else if (args[0] === "invite" && args[1] === "revoke" && args[2] && args.length === 3) {
  result = await call(`/invitations/${encodeURIComponent(args[2])}`, { method: "DELETE" });
} else if (args[0] === "user" && args[1] === "recover" && args[2]) {
  const daysValue = option("--days");
  result = await call("/users/recover", {
    method: "POST",
    body: JSON.stringify({ email: args[2], days: daysValue ? Number(daysValue) : 1 }),
  });
} else if (args[0] === "client" && args[1] === "provision" && args[2] && args.length === 3) {
  result = await call("/client", {
    method: "POST",
    body: JSON.stringify({ teamName: args[2] }),
  });
} else if (args[0] === "client" && args[1] === "show" && args.length === 2) {
  result = await call("/client");
} else {
  usage();
}

console.log(JSON.stringify(result, null, 2));

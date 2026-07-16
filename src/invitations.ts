import { APIError } from "better-auth/api";
import { sha256Hex } from "./crypto";

export interface InvitationRow {
  id: string;
  email: string;
  user_id: string;
  expires_at: number;
  used_at: number | null;
  revoked_at: number | null;
  created_at: number;
}

export async function resolveInvitation(
  db: D1Database,
  token: string | null | undefined,
): Promise<InvitationRow> {
  if (!token) {
    throw new APIError("FORBIDDEN", { message: "A valid invitation is required" });
  }

  const tokenHash = await sha256Hex(token);
  const invitation = await db
    .prepare(
      `SELECT id, email, user_id, expires_at, used_at, revoked_at, created_at
       FROM invitation
       WHERE token_hash = ?1
         AND used_at IS NULL
         AND revoked_at IS NULL
         AND expires_at > ?2`,
    )
    .bind(tokenHash, Date.now())
    .first<InvitationRow>();

  if (!invitation) {
    throw new APIError("FORBIDDEN", { message: "This invitation is invalid or expired" });
  }

  return invitation;
}

export async function consumeInvitation(db: D1Database, token: string): Promise<InvitationRow> {
  const tokenHash = await sha256Hex(token);
  const invitation = await db
    .prepare(
      `UPDATE invitation
       SET used_at = ?1
       WHERE token_hash = ?2
         AND used_at IS NULL
         AND revoked_at IS NULL
         AND expires_at > ?1
       RETURNING id, email, user_id, expires_at, used_at, revoked_at, created_at`,
    )
    .bind(Date.now(), tokenHash)
    .first<InvitationRow>();

  if (!invitation) {
    throw new APIError("FORBIDDEN", { message: "This invitation has already been used" });
  }

  return invitation;
}

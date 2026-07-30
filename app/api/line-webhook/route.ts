import { env } from "cloudflare:workers";
import { ensureGuardianReportTables } from "../../../lib/guardian-reports";

type LineEnv = {
  DB: D1Database;
  LINE_CHANNEL_SECRET?: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
};

type LineEvent = {
  type?: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type?: string; text?: string };
};

async function verifySignature(body: string, signature: string, secret: string) {
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const signatureBytes = Uint8Array.from(atob(signature), (character) => character.charCodeAt(0));
    return crypto.subtle.verify("HMAC", key, signatureBytes, new TextEncoder().encode(body));
  } catch {
    return false;
  }
}

async function replyToLine(token: string, replyToken: string, text: string) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
}

export async function POST(request: Request) {
  const runtime = env as unknown as LineEnv;
  if (!runtime.LINE_CHANNEL_SECRET) return Response.json({ error: "LINE channel secret is not configured" }, { status: 503 });
  const signature = request.headers.get("x-line-signature") ?? "";
  const body = await request.text();
  if (!signature || !(await verifySignature(body, signature, runtime.LINE_CHANNEL_SECRET))) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  await ensureGuardianReportTables(runtime.DB);
  let payload: { events?: LineEvent[] };
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  for (const event of payload.events ?? []) {
    const pairingCode = event.message?.type === "text" ? event.message.text?.trim().toUpperCase() : undefined;
    const lineUserId = event.source?.userId;
    if (!pairingCode || !lineUserId || !event.replyToken) continue;

    const profile = await runtime.DB.prepare(`SELECT student_id, student_name FROM guardian_profiles
      WHERE pairing_code = ? AND parent_line_user_id IS NULL AND pairing_used_at IS NULL
        AND datetime(pairing_expires_at) > CURRENT_TIMESTAMP`)
      .bind(pairingCode).first<{ student_id: string; student_name: string }>();
    if (!profile) {
      if (runtime.LINE_CHANNEL_ACCESS_TOKEN) await replyToLine(runtime.LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, "連携コードが見つかりません。STUDY BASEに表示されたコードをご確認ください。");
      continue;
    }

    const linked = await runtime.DB.prepare(`UPDATE guardian_profiles
      SET parent_line_user_id = ?, pairing_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE student_id = ? AND parent_line_user_id IS NULL AND pairing_used_at IS NULL
        AND datetime(pairing_expires_at) > CURRENT_TIMESTAMP`)
      .bind(lineUserId, profile.student_id).run();
    if (!linked.meta.changes) continue;
    if (runtime.LINE_CHANNEL_ACCESS_TOKEN) await replyToLine(runtime.LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, `${profile.student_name}さんの学習レポートと連携しました。毎朝7時に前日の集計をお届けします。`);
  }

  return Response.json({ ok: true });
}

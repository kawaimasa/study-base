export type PresenceStatus = "studying" | "away" | "stopped";

export type PresenceUpdate = {
  sessionId: string;
  status: PresenceStatus;
  mode: string;
  subject: string;
  detail: string;
  startedAtMs: number;
  activeSeconds: number;
};

export async function ensureStudyPresenceTable(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS study_presence (
      student_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'stopped' CHECK (status IN ('studying', 'away', 'stopped')),
      mode TEXT NOT NULL DEFAULT 'study',
      subject TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      started_at_ms INTEGER NOT NULL DEFAULT 0,
      active_seconds INTEGER NOT NULL DEFAULT 0,
      last_seen_at_ms INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS study_presence_status_seen_idx ON study_presence(status, last_seen_at_ms)"),
  ]);
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function normalizePresenceUpdate(value: Partial<PresenceUpdate>): PresenceUpdate {
  const status = value.status === "studying" || value.status === "away" || value.status === "stopped"
    ? value.status
    : "stopped";
  return {
    sessionId: cleanText(value.sessionId, 100),
    status,
    mode: cleanText(value.mode, 40) || "study",
    subject: cleanText(value.subject, 40),
    detail: cleanText(value.detail, 120),
    startedAtMs: Math.max(0, Math.floor(Number(value.startedAtMs) || 0)),
    activeSeconds: Math.max(0, Math.floor(Number(value.activeSeconds) || 0)),
  };
}

export async function saveStudyPresence(db: D1Database, studentId: string, input: Partial<PresenceUpdate>) {
  await ensureStudyPresenceTable(db);
  const presence = normalizePresenceUpdate(input);
  if (!presence.sessionId) throw new Error("session id is required");
  const now = Date.now();
  await db.prepare(`INSERT INTO study_presence
    (student_id, session_id, status, mode, subject, detail, started_at_ms, active_seconds, last_seen_at_ms, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id) DO UPDATE SET
      session_id = excluded.session_id,
      status = excluded.status,
      mode = excluded.mode,
      subject = excluded.subject,
      detail = excluded.detail,
      started_at_ms = CASE
        WHEN study_presence.session_id = excluded.session_id THEN study_presence.started_at_ms
        ELSE excluded.started_at_ms
      END,
      active_seconds = CASE
        WHEN study_presence.session_id = excluded.session_id THEN MAX(study_presence.active_seconds, excluded.active_seconds)
        ELSE excluded.active_seconds
      END,
      last_seen_at_ms = excluded.last_seen_at_ms,
      updated_at = CURRENT_TIMESTAMP`)
    .bind(
      studentId,
      presence.sessionId,
      presence.status,
      presence.mode,
      presence.subject,
      presence.detail,
      presence.startedAtMs || now,
      presence.activeSeconds,
      now,
    )
    .run();
  return { ...presence, lastSeenAtMs: now };
}

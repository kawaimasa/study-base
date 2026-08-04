"use client";

import { FormEvent, useEffect, useState } from "react";

type Diagnostics = {
  student: { id: string; display_name: string };
  summaryDate: string;
  sessions: Array<Record<string, unknown>>;
  attemptTimes: string[];
};

export default function FocusCorrectionPage() {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const displayName = params.get("displayName") || "るいと";
    const summaryDate = params.get("summaryDate") || "2026-08-04";
    fetch(`/api/admin-focus-correction?displayName=${encodeURIComponent(displayName)}&summaryDate=${summaryDate}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "取得できませんでした");
        setData(body);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!data) return;
    setSaved("");
    const response = await fetch("/api/admin-focus-correction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: data.student.id, summaryDate: data.summaryDate, activeSeconds: Number(seconds) }),
    });
    const body = await response.json();
    if (!response.ok) return setError(body.error || "反映できませんでした");
    setSaved(`${Math.round(body.activeSeconds / 60)}分を反映しました`);
  }

  if (error) return <main style={{ padding: 32 }}><h1>エラー</h1><pre>{error}</pre></main>;
  if (!data) return <main style={{ padding: 32 }}><p>本日の記録を確認中…</p></main>;
  return <main style={{ padding: 32, fontFamily: "sans-serif" }}>
    <h1>{data.student.display_name}・{data.summaryDate}</h1>
    <p>解答 {data.attemptTimes.length}問／セッション {data.sessions.length}件</p>
    <pre style={{ whiteSpace: "pre-wrap", background: "#f4f1ff", padding: 16 }}>{JSON.stringify(data, null, 2)}</pre>
    <form onSubmit={submit} style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <label>補正秒数 <input aria-label="補正秒数" type="number" min="0" max="21600" value={seconds} onChange={(event) => setSeconds(event.target.value)} required /></label>
      <button type="submit">本日分を反映</button>
    </form>
    {saved && <p role="status">{saved}</p>}
  </main>;
}

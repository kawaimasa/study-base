"use client";

import { FormEvent, useState } from "react";

type DeleteResult = {
  deleted?: boolean;
  displayName?: string;
  relatedRowsDeleted?: number;
  remainingAccounts?: number;
  error?: string;
};

export default function StudentCleanupPage() {
  const [displayName, setDisplayName] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin-student-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, confirmation }),
      });
      const result = await response.json() as DeleteResult;
      if (!response.ok || !result.deleted) throw new Error(result.error || "削除に失敗しました。");
      setMessage(`${result.displayName}を削除しました。関連データ${result.relatedRowsDeleted ?? 0}件、残存アカウント${result.remainingAccounts ?? 0}件です。`);
      setDisplayName("");
      setConfirmation("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "削除に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-auth-page">
      <section className="auth-card admin-auth-card" aria-labelledby="cleanup-title">
        <a className="admin-back" href="/admin">← 管理画面へ</a>
        <p className="eyebrow">ADMIN ONLY</p>
        <h1 id="cleanup-title">生徒データの完全削除</h1>
        <p className="auth-lead">名前が完全一致する生徒1人と、その学習・離脱・問題・テスト・保護者連携データを削除します。</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>生徒名</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
          </label>
          <label>
            <span>確認文字</span>
            <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="完全削除" required />
          </label>
          <button className="auth-submit admin-submit" type="submit" disabled={busy || confirmation !== "完全削除"}>
            {busy ? "削除中…" : "生徒と関連データを完全削除"}
          </button>
        </form>
        {message && <p role="status" className="auth-footnote">{message}</p>}
      </section>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Admin = { id: string; loginId: string; displayName: string };
type StudentRow = {
  id: string;
  display_name: string;
  created_at: string;
  focus_seconds: number;
  questions_solved: number;
  correct_answers: number;
  guardian_connected: number;
  pairing_code: string | null;
  notifications_enabled: number;
  is_active: number;
};
type Dashboard = {
  today: string;
  totals: { student_count: number; focus_seconds: number; questions_solved: number; correct_answers: number };
  students: StudentRow[];
  integrations: { lineWebhookConfigured: boolean; linePushConfigured: boolean };
};
type WeeklyTestRow = {
  id: string;
  title: string;
  starts_at: string;
  duration_minutes: number;
  question_count: number;
  subjects: string[];
  status: string;
  submission_count: number;
  completed_count: number;
  average_score: number;
  phase: "開始前" | "実施中" | "終了";
};
type WeeklySubmissionRow = {
  test_id: string;
  test_title: string;
  display_name: string;
  status: string;
  correct_answers: number;
  total_questions: number;
  away_seconds: number;
  started_at: string;
  submitted_at: string | null;
};

function defaultTestStart() {
  const date = new Date(Date.now() + 10 * 60_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatMinutes(seconds: number) {
  const minutes = Math.floor(Number(seconds || 0) / 60);
  return `${Math.floor(minutes / 60)}時間${minutes % 60}分`;
}

export default function AdminPage() {
  const [status, setStatus] = useState<"loading" | "setup" | "login" | "authenticated">("loading");
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loginId, setLoginId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null);
  const [dashboardMessage, setDashboardMessage] = useState("");
  const [weeklyTests, setWeeklyTests] = useState<WeeklyTestRow[]>([]);
  const [weeklySubmissions, setWeeklySubmissions] = useState<WeeklySubmissionRow[]>([]);
  const [testTitle, setTestTitle] = useState("7日間総復習テスト");
  const [testStartsAt, setTestStartsAt] = useState(defaultTestStart);
  const [testDuration, setTestDuration] = useState(30);
  const [testQuestionCount, setTestQuestionCount] = useState(25);
  const [testQuestionSource, setTestQuestionSource] = useState<"correct" | "smart">("correct");
  const [testSubjects, setTestSubjects] = useState<string[]>(["国語", "数学", "英語", "理科", "社会"]);
  const [testSaving, setTestSaving] = useState(false);
  const [testMessage, setTestMessage] = useState("");

  const loadDashboard = async () => {
    const response = await fetch("/api/admin-dashboard");
    if (!response.ok) throw new Error("管理データを読み込めませんでした。");
    setDashboard(await response.json() as Dashboard);
  };

  const loadWeeklyTests = async () => {
    const response = await fetch("/api/weekly-tests-admin");
    if (!response.ok) throw new Error("一斉テストを読み込めませんでした。");
    const data = await response.json() as { tests: WeeklyTestRow[]; submissions: WeeklySubmissionRow[] };
    setWeeklyTests(data.tests);
    setWeeklySubmissions(data.submissions);
  };

  useEffect(() => {
    void fetch("/api/admin-auth")
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => {
        if (data.authenticated && data.admin) {
          setAdmin(data.admin as Admin);
          setStatus("authenticated");
          return Promise.all([loadDashboard(), loadWeeklyTests()]);
        }
        setStatus(data.setupRequired ? "setup" : "login");
      })
      .catch(() => {
        setError("管理者ログインを確認できませんでした。");
        setStatus("login");
      });
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    const timer = window.setInterval(() => {
      void loadDashboard().catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [status]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/admin-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: status === "setup" ? "setup" : "login", loginId, displayName, pin }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(String(data.error ?? "ログインできませんでした。"));
      setAdmin(data.admin as Admin);
      setPin("");
      setStatus("authenticated");
      await Promise.all([loadDashboard(), loadWeeklyTests()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ログインできませんでした。");
    } finally {
      setSubmitting(false);
    }
  };

  const logout = async () => {
    await fetch("/api/admin-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) }).catch(() => undefined);
    setAdmin(null);
    setDashboard(null);
    setStatus("login");
  };

  const updateGuardianNotification = async (studentId: string, enabled: boolean) => {
    setSavingStudentId(studentId);
    setDashboardMessage("");
    try {
      const response = await fetch("/api/admin-dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, enabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(String(data.error ?? "設定を保存できませんでした。"));
      await loadDashboard();
      setDashboardMessage(enabled ? "朝7時の保護者LINE通知をONにしました。" : "保護者LINE通知をOFFにしました。");
    } catch (caught) {
      setDashboardMessage(caught instanceof Error ? caught.message : "設定を保存できませんでした。");
    } finally {
      setSavingStudentId(null);
    }
  };

  const updateStudentStatus = async (studentId: string, active: boolean) => {
    setSavingStudentId(studentId);
    setDashboardMessage("");
    try {
      const response = await fetch("/api/admin-dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "student-status", studentId, active }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(String(data.error ?? "在籍状態を変更できませんでした。"));
      await loadDashboard();
      setDashboardMessage(active ? "生徒を利用中に戻しました。" : "生徒を停止しました。記録は削除されません。");
    } catch (caught) {
      setDashboardMessage(caught instanceof Error ? caught.message : "在籍状態を変更できませんでした。");
    } finally {
      setSavingStudentId(null);
    }
  };

  const createWeeklyTest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTestSaving(true);
    setTestMessage("");
    try {
      const response = await fetch("/api/weekly-tests-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          title: testTitle,
          startsAt: new Date(testStartsAt).toISOString(),
          durationMinutes: testDuration,
          questionCount: testQuestionCount,
          subjects: testSubjects,
          questionSource: testQuestionSource,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(String(data.error ?? "テストを作成できませんでした。"));
      setTestMessage("弱点優先の一斉テストを公開しました。開始時刻になると全員に同じ問題が配信されます。");
      setTestStartsAt(defaultTestStart());
      await loadWeeklyTests();
    } catch (caught) {
      setTestMessage(caught instanceof Error ? caught.message : "テストを作成できませんでした。");
    } finally {
      setTestSaving(false);
    }
  };

  const cancelWeeklyTest = async (testId: string) => {
    setTestMessage("");
    const response = await fetch("/api/weekly-tests-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", testId }),
    });
    if (response.ok) {
      setTestMessage("テストを中止しました。");
      await loadWeeklyTests();
    } else {
      setTestMessage("テストを中止できませんでした。");
    }
  };

  if (status !== "authenticated" || !admin) {
    return (
      <main className="admin-auth-page">
        <section className="auth-card admin-auth-card" aria-labelledby="admin-auth-title">
          <Link className="admin-back" href="/">← 生徒画面へ</Link>
          <div className="auth-brand"><span className="brand-mark admin-mark">A</span><strong>STUDY BASE ADMIN</strong></div>
          {status === "loading" ? <div className="auth-loading" role="status"><span /><p>管理者情報を確認しています…</p></div> : <>
            <p className="eyebrow">ADMINISTRATOR ONLY</p>
            <h1 id="admin-auth-title">{status === "setup" ? "最初の管理者を登録" : "管理者ログイン"}</h1>
            <p className="auth-lead">{status === "setup" ? "この登録が完了すると、新しい管理者は追加できません。IDとPINを安全に保管してください。" : "生徒の学習状況を確認する管理者専用画面です。"}</p>
            <form className="auth-form" onSubmit={submit}>
              {status === "setup" && <label><span>管理者名</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={20} placeholder="例：教室長" required /></label>}
              <label><span>管理者ID</span><input value={loginId} onChange={(event) => setLoginId(event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))} minLength={3} maxLength={30} autoComplete="username" placeholder="例：admin01" required /></label>
              <label><span>{status === "setup" ? "管理者PINを決める" : "管理者PIN"}</span><input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))} inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete={status === "setup" ? "new-password" : "current-password"} placeholder="6〜12桁の数字" required /></label>
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="primary-button auth-submit admin-submit" disabled={submitting}>{submitting ? "確認中…" : status === "setup" ? "管理者を登録する" : "管理画面へログイン"}</button>
            </form>
            <small className="auth-footnote">5回失敗すると10分間ロックされます。</small>
          </>}
        </section>
      </main>
    );
  }

  const totals = dashboard?.totals;
  const accuracy = Number(totals?.questions_solved ?? 0) > 0 ? Math.round(Number(totals?.correct_answers ?? 0) / Number(totals?.questions_solved ?? 1) * 100) : 0;

  return (
    <main className="admin-page">
      <header className="admin-topbar"><Link className="brand" href="/"><span className="brand-mark admin-mark">A</span><span>STUDY BASE ADMIN</span></Link><div><span>{admin.displayName}</span><button onClick={() => void logout()}>ログアウト</button></div></header>
      <div className="admin-shell">
        <section className="admin-heading"><div><p className="eyebrow">ADMIN DASHBOARD・{dashboard?.today ?? ""}</p><h1>学習状況を見守る</h1><p>生徒の今日の取り組みを、ひと目で確認できます。</p></div><button onClick={() => void Promise.all([loadDashboard(), loadWeeklyTests()])}>↻ 最新に更新</button></section>
        <section className="admin-stats" aria-label="今日の集計">
          <article><span>登録生徒</span><strong>{Number(totals?.student_count ?? 0)}<small>人</small></strong></article>
          <article><span>今日の集中時間</span><strong>{formatMinutes(Number(totals?.focus_seconds ?? 0))}</strong></article>
          <article><span>今日解いた問題</span><strong>{Number(totals?.questions_solved ?? 0)}<small>問</small></strong></article>
          <article><span>今日の正答率</span><strong>{accuracy}<small>%</small></strong></article>
        </section>
        <section className="admin-weekly-tests">
          <div className="section-heading"><div><p className="eyebrow">LIVE WEEKLY TEST</p><h2>7日間・一斉テスト</h2></div><span>開始時刻は日本時間</span></div>
          <div className="weekly-admin-grid">
            <form className="weekly-test-form" onSubmit={createWeeklyTest}>
              <h3>新しいテストを作成</h3>
              <label><span>テスト名</span><input value={testTitle} onChange={(event) => setTestTitle(event.target.value)} maxLength={80} required /></label>
              <label><span>出題元</span><select value={testQuestionSource} onChange={(event) => setTestQuestionSource(event.target.value === "smart" ? "smart" : "correct")}><option value="correct">過去7日間に正解した問題</option><option value="smart">苦手・重要問題を優先</option></select></label>
              <div className="weekly-form-row"><label><span>開始日時</span><input type="datetime-local" value={testStartsAt} onChange={(event) => setTestStartsAt(event.target.value)} required /></label><label><span>制限時間</span><input type="number" min="5" max="180" value={testDuration} onChange={(event) => setTestDuration(Number(event.target.value))} required /><small>分</small></label><label><span>問題数</span><input type="number" min="5" max="50" value={testQuestionCount} onChange={(event) => setTestQuestionCount(Number(event.target.value))} required /><small>問</small></label></div>
              <fieldset><legend>出題科目</legend><div className="weekly-subject-checks">{["国語", "数学", "英語", "理科", "社会"].map((subject) => <label key={subject}><input type="checkbox" checked={testSubjects.includes(subject)} onChange={(event) => setTestSubjects((current) => event.target.checked ? [...current, subject] : current.filter((item) => item !== subject))} /><span>{subject}</span></label>)}</div></fieldset>
              <p>{testQuestionSource === "correct" ? "過去7日間に生徒が正解した問題から、科目の偏りを抑えて週末の定着確認テストを作成します。問題が足りない場合は重要問題で補います。" : "過去7日間でみんなが間違えた問題、重要問題、解いた回数が少ない単元を優先して自動構成します。"}</p>
              <button className="primary-button" disabled={testSaving || testSubjects.length === 0}>{testSaving ? "作成中…" : "一斉テストを作成・公開"}</button>
              {testMessage && <div className="weekly-test-message" role="status">{testMessage}</div>}
            </form>
            <div className="weekly-test-list">
              <h3>公開済みテスト</h3>
              {weeklyTests.length > 0 ? weeklyTests.map((test) => {
                const start = new Date(test.starts_at);
                const status = test.status === "cancelled" ? "中止" : test.phase;
                return <article key={test.id} className={status === "実施中" ? "live" : ""}><div className="weekly-test-list-head"><span>{status}</span><strong>{test.title}</strong></div><p>{start.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}開始・{test.duration_minutes}分・{test.question_count}問</p><small>{test.subjects.join("・")}</small><div className="weekly-result-mini"><span>提出 <strong>{Number(test.completed_count)}人</strong></span><span>平均 <strong>{Math.round(Number(test.average_score))}%</strong></span></div>{status === "開始前" && <button onClick={() => void cancelWeeklyTest(test.id)}>中止する</button>}</article>;
              }) : <div className="weekly-test-empty">まだテストはありません。</div>}
            </div>
          </div>
          <div className="weekly-submission-results">
            <div><h3>受験・採点結果</h3><span>離脱時間もここで確認できます</span></div>
            <div className="admin-table-wrap">
              <table><thead><tr><th>テスト</th><th>生徒</th><th>状況</th><th>得点</th><th>正答率</th><th>離脱時間</th><th>提出時刻</th></tr></thead><tbody>
                {weeklySubmissions.map((submission) => {
                  const submitted = submission.status === "submitted";
                  const rate = submission.total_questions > 0 ? Math.round(submission.correct_answers / submission.total_questions * 100) : 0;
                  return <tr key={`${submission.test_id}-${submission.display_name}`}><td><strong>{submission.test_title}</strong></td><td>{submission.display_name}</td><td><span className={submitted ? "admin-connected" : "admin-unconnected"}>{submitted ? "提出済み" : "受験中"}</span></td><td>{submitted ? `${submission.correct_answers} / ${submission.total_questions}` : "—"}</td><td>{submitted ? `${rate}%` : "—"}</td><td>{formatMinutes(submission.away_seconds)}</td><td>{submission.submitted_at ? new Date(submission.submitted_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "未提出"}</td></tr>;
                })}
                {weeklySubmissions.length === 0 && <tr><td className="admin-empty" colSpan={7}>受験を始めた生徒がここに表示されます。</td></tr>}
              </tbody></table>
            </div>
          </div>
        </section>
        <section className="admin-students">
          <div className="section-heading"><div><p className="eyebrow">GUARDIAN LINE・ADMIN ONLY</p><h2>生徒・保護者LINE管理</h2></div><span>最大100人表示</span></div>
          <div className="admin-guardian-note">
            <p><strong>LINE接続：</strong><span className={dashboard?.integrations?.lineWebhookConfigured && dashboard?.integrations?.linePushConfigured ? "admin-connected" : "admin-unconnected"}>{dashboard?.integrations?.lineWebhookConfigured && dashboard?.integrations?.linePushConfigured ? "送信準備OK" : "未設定があります"}</span></p>
            <strong>この設定と連携コードは、管理者だけに表示されます。</strong>
            <span>保護者への事前案内が済んだ生徒のみ、朝7時通知をONにしてください。</span>
            {dashboardMessage && <em role="status">{dashboardMessage}</em>}
          </div>
          <div className="admin-table-wrap">
            <div className="admin-student-status-list" aria-label="生徒の利用状態">
              {(dashboard?.students ?? []).map((student) => (
                <button
                  key={`status-${student.id}`}
                  className={`admin-line-toggle${student.is_active ? " enabled" : ""}`}
                  disabled={savingStudentId === student.id}
                  onClick={() => void updateStudentStatus(student.id, !Boolean(student.is_active))}
                >
                  {student.display_name}：{student.is_active ? "利用中" : "停止中"}
                </button>
              ))}
            </div>
            <table><thead><tr><th>生徒</th><th>集中時間</th><th>問題数</th><th>正答率</th><th>接続状況</th><th>朝7時通知</th><th>連携コード</th></tr></thead><tbody>
              {(dashboard?.students ?? []).map((student) => {
                const studentAccuracy = Number(student.questions_solved) > 0 ? Math.round(Number(student.correct_answers) / Number(student.questions_solved) * 100) : 0;
                const enabled = Boolean(student.notifications_enabled);
                return <tr key={student.id}><td><span className="student-initial">{String(student.display_name).slice(0, 1)}</span><strong>{student.display_name}</strong></td><td>{formatMinutes(student.focus_seconds)}</td><td>{student.questions_solved}問</td><td>{studentAccuracy}%</td><td><span className={student.guardian_connected ? "admin-connected" : "admin-unconnected"}>{student.guardian_connected ? "連携済み" : "未連携"}</span></td><td><button className={`admin-line-toggle${enabled ? " enabled" : ""}`} disabled={savingStudentId === student.id} onClick={() => void updateGuardianNotification(student.id, !enabled)} aria-pressed={enabled}>{savingStudentId === student.id ? "保存中…" : enabled ? "通知 ON" : "通知 OFF"}</button></td><td><code className="admin-pairing-code">{student.pairing_code ?? "ONで発行"}</code></td></tr>;
              })}
              {(dashboard?.students.length ?? 0) === 0 && <tr><td className="admin-empty" colSpan={7}>生徒が登録されると、ここに表示されます。</td></tr>}
            </tbody></table>
          </div>
        </section>
      </div>
    </main>
  );
}

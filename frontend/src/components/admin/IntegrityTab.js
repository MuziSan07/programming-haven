"use client";

import Link from "next/link";
import { useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { timeAgo } from "@/lib/time";
import { Badge, Button, Card, ErrorState, PageLoader, cx } from "@/components/ui";

const KIND_LABEL = {
  left_tab: "Left the interview window", paste: "Pasted into an answer", ai_tool_on_screen: "AI tool on screen",
  another_person: "Another person helping", phone: "Reading from another device", other: "Other",
};

function banStatus(b) {
  if (b.lifted) return { label: "Lifted", tone: "neutral" };
  if (b.active) return { label: b.permanent ? "Permanent" : "Active", tone: "bad" };
  return { label: "Expired", tone: "neutral" };
}

export default function IntegrityTab() {
  const { data, error, loading, reload } = useApi("/api/admin/integrity");
  const [busy, setBusy] = useState(null);

  async function lift(id) {
    if (!confirm("Lift this ban? The user can start interviews again, and this offense stops counting toward escalation.")) return;
    setBusy(id);
    try {
      await api(`/api/admin/integrity/bans/${id}/lift`, { method: "POST" });
      reload();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand" />
        <p>AI interviews watch for leaving the window, pasting answers, and (with camera or screen share on) AI tools,
          other people or phones in view. The first strike in an interview is a warning; the second ends it and locks
          AI interviews for 1 hour, then 24 hours, 3 days, 1 week, 1 month, and finally permanently. Lifting a ban
          also stops it counting toward that ladder.</p>
      </div>

      <Card className="overflow-hidden">
        <h2 className="border-b border-line px-4 py-3 font-semibold">Bans</h2>
        {data.bans.length === 0 ? <p className="p-4 text-sm text-faint">No bans yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr><th className="px-4 py-2">User</th><th className="px-4 py-2">Offense</th><th className="px-4 py-2">Length</th>
                  <th className="px-4 py-2">Until</th><th className="px-4 py-2">Reason</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.bans.map((b) => {
                  const st = banStatus(b);
                  return (
                    <tr key={b.id}>
                      <td className="px-4 py-2.5"><p className="font-medium">{b.user.name}</p><p className="text-xs text-faint">{b.user.email}</p></td>
                      <td className="px-4 py-2.5">#{b.offense}</td>
                      <td className="px-4 py-2.5">{b.length}</td>
                      <td className="px-4 py-2.5 text-xs">{b.permanent ? "Contact support" : new Date(b.ends_at).toLocaleString()}</td>
                      <td className="max-w-xs px-4 py-2.5 text-xs text-muted">
                        {b.reason}{b.session_id && <> · <Link href={`/interview/${b.session_id}`} className="text-brand hover:underline">session</Link></>}
                      </td>
                      <td className="px-4 py-2.5"><Badge tone={st.tone}>{st.label}</Badge></td>
                      <td className="px-4 py-2.5 text-right">
                        {b.active && <Button size="sm" variant="secondary" loading={busy === b.id} onClick={() => lift(b.id)}>Lift</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <h2 className="border-b border-line px-4 py-3 font-semibold">Recent strikes</h2>
        {data.strikes.length === 0 ? <p className="p-4 text-sm text-faint">No strikes recorded.</p> : (
          <ul className="divide-y divide-line">
            {data.strikes.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <ShieldAlert className={cx("size-4", s.action === "terminated" ? "text-bad" : "text-warn")} />
                <span className="font-medium">{s.user.name}</span>
                <span className="text-muted">{KIND_LABEL[s.kind] || s.kind}</span>
                {s.detail && <span className="text-xs text-faint">{s.detail}</span>}
                <Badge tone={s.action === "terminated" ? "bad" : "warn"}>{s.action}</Badge>
                <span className="ml-auto text-xs text-faint">{timeAgo(s.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

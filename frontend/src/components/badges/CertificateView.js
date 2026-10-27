"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { BadgeCheck, Printer, ShieldCheck, ShieldX } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { Logo, LogoMark } from "@/components/Logo";
import { Button, ErrorState, PageLoader } from "@/components/ui";
import { kindLabel } from "./CertificateCard";

const INK = "#0f172a";
const SOFT = "#475569";
const GOLD = "#b8892b";
const ACCENT = "#5b3fd9";

function Field({ label, value, mono }) {
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: SOFT }}>{label}</p>
      <p className={mono ? "mt-1 font-mono text-sm break-all" : "mt-1 text-base font-semibold"} style={{ color: INK }}>{value}</p>
    </div>
  );
}

function NotVerified() {
  return (
    <div className="card mx-auto flex max-w-lg flex-col items-center p-10 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-bad/15">
        <ShieldX className="size-7 text-bad" />
      </span>
      <h1 className="mt-5 text-xl font-bold">This certificate could not be verified</h1>
      <p className="mt-2 text-sm text-muted">
        No Programming Haven certificate exists with this ID. Check that the link was copied in full, or ask the holder
        for a fresh link.
      </p>
      <Button href="/" variant="secondary" className="mt-6">Go to Programming Haven</Button>
    </div>
  );
}

function Certificate({ cert }) {
  const issued = new Date(cert.issued_at).toLocaleDateString(undefined, { dateStyle: "long" });
  return (
    <article className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-2xl shadow-2xl print:max-w-none print:rounded-none print:shadow-none"
      style={{ background: "#fdfcf8", color: INK, WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
      <div className="m-3 rounded-xl border-2 p-6 sm:m-4 sm:p-12" style={{ borderColor: `${GOLD}66` }}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-9" />
            <span className="text-sm font-semibold tracking-tight">Programming Haven</span>
          </div>
          <span className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: "#dcfce7", color: "#166534" }}>
            <BadgeCheck className="size-4" /> Verified
          </span>
        </div>

        <div className="mt-10 text-center sm:mt-14">
          <p className="text-[11px] font-semibold tracking-[0.3em] uppercase" style={{ color: GOLD }}>
            Certificate of achievement · {kindLabel(cert.kind)}
          </p>
          <p className="mt-6 text-sm" style={{ color: SOFT }}>This certifies that</p>
          <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight sm:text-5xl" style={{ color: INK }}>{cert.holder}</h1>
          <p className="mt-5 text-sm" style={{ color: SOFT }}>has successfully earned</p>
          <h2 className="mx-auto mt-2 max-w-xl text-xl font-semibold sm:text-2xl" style={{ color: ACCENT }}>{cert.title}</h2>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-6 border-t pt-8 sm:mt-14 sm:grid-cols-4" style={{ borderColor: "#e2e8f0" }}>
          <Field label="Score" value={cert.score != null ? Math.round(cert.score) : "-"} />
          <Field label="Integrity" value={cert.integrity != null ? Math.round(cert.integrity) : "-"} />
          <Field label="Issued" value={issued} />
          <Field label="Issuer" value={cert.issuer || "Programming Haven"} />
        </div>

        <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <Field label="Certificate ID" value={cert.id} mono />
          <div className="flex items-center gap-3">
            <span className="flex size-16 items-center justify-center rounded-full border-4"
              style={{ borderColor: GOLD, color: GOLD, background: `${GOLD}14` }}>
              <ShieldCheck className="size-8" />
            </span>
            <p className="text-xs leading-relaxed" style={{ color: SOFT }}>
              Issued and verified by<br /><span className="font-semibold" style={{ color: INK }}>Programming Haven</span>
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function CertificateView() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi(id ? `/api/public/certificates/${encodeURIComponent(id)}` : null);

  let body;
  if (loading || (!data && !error)) body = <PageLoader label="Verifying certificate" />;
  else if (error?.status === 404) body = <NotVerified />;
  else if (error) body = <ErrorState error={error} onRetry={reload} />;
  else body = <Certificate cert={data} />;

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 print:min-h-0 print:bg-white print:p-0">
      <header className="mx-auto mb-8 flex max-w-3xl items-center justify-between gap-3 print:hidden">
        <Logo />
        {data && (
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" /> Print / Save as PDF
          </Button>
        )}
      </header>
      <main>{body}</main>
      {data && (
        <p className="mx-auto mt-6 max-w-3xl text-center text-xs text-faint print:hidden">
          This page is the official verification record for certificate {data.id}.{" "}
          <Link href="/" className="text-muted underline hover:text-text">Learn about Programming Haven</Link>
        </p>
      )}
    </div>
  );
}

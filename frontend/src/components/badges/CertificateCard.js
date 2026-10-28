"use client";

import { useState } from "react";
import { Award, Check, Copy, ExternalLink, Share2, ShieldCheck } from "lucide-react";
import { Badge, Button } from "@/components/ui";

const KIND_LABEL = { test: "Mock test", hackathon: "Hackathon", vetting: "Mock vetting" };

export function kindLabel(kind) {
  return KIND_LABEL[kind] || (kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : "Certificate");
}

export default function CertificateCard({ cert }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  const verifyUrl = () => `${window.location.origin}/verify/${cert.id}`;

  async function copyLink() {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(verifyUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError("Could not copy. Open the certificate and copy the address bar.");
    }
  }

  function addToLinkedIn() {
    const params = new URLSearchParams({
      startTask: "CERTIFICATION_NAME",
      name: cert.title,
      organizationName: "Programming Haven",
      issueYear: String(cert.issue_year),
      issueMonth: String(cert.issue_month),
      certUrl: verifyUrl(),
      certId: cert.id,
    });
    window.open(`https://www.linkedin.com/profile/add?${params.toString()}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-warn/40 bg-warn/10 text-warn">
          <Award className="size-6" />
        </span>
        <div className="min-w-0">
          <Badge tone="brand">{kindLabel(cert.kind)}</Badge>
          <p className="mt-2 font-semibold leading-snug">{cert.title}</p>
          <p className="mt-0.5 text-xs text-faint">
            Issued {new Date(cert.issued_at).toLocaleDateString(undefined, { dateStyle: "long" })}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface-2 px-3 py-2">
          <p className="text-[11px] text-faint">Score</p>
          <p className="font-mono font-semibold">{cert.score != null ? Math.round(cert.score) : "-"}</p>
        </div>
        <div className="rounded-xl bg-surface-2 px-3 py-2">
          <p className="flex items-center gap-1 text-[11px] text-faint"><ShieldCheck className="size-3" /> Integrity</p>
          <p className="font-mono font-semibold">{cert.integrity != null ? Math.round(cert.integrity) : "-"}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        <Button size="sm" href={`/verify/${cert.id}`}><ExternalLink className="size-3.5" /> View / share</Button>
        <Button size="sm" variant="secondary" onClick={copyLink}>
          {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy link"}
        </Button>
        <Button size="sm" variant="secondary" onClick={addToLinkedIn}><Share2 className="size-3.5" /> Add to LinkedIn</Button>
      </div>
      {copyError && <p className="mt-2 text-xs text-bad">{copyError}</p>}
    </div>
  );
}

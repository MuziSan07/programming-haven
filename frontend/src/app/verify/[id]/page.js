import { Suspense } from "react";
import CertificateView from "@/components/badges/CertificateView";
import { PageLoader } from "@/components/ui";

export const metadata = { title: "Verify certificate" };

// Public page: no AppShell, no auth. useParams needs a Suspense boundary outside the (app) group.
export default function VerifyCertificatePage() {
  return (
    <Suspense fallback={<PageLoader label="Verifying certificate" />}>
      <CertificateView />
    </Suspense>
  );
}

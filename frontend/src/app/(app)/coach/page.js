"use client";

import { useSearchParams } from "next/navigation";
import { useApi } from "@/lib/useApi";
import { ErrorState, PageLoader } from "@/components/ui";
import PlanView from "@/components/coach/PlanView";
import PlanWizard from "@/components/coach/PlanWizard";

export default function CoachPage() {
  const params = useSearchParams();
  const onboarding = params.get("onboarding") === "1";
  const { data, error, loading, reload, setData } = useApi("/api/coach/plan");

  if (loading) return <PageLoader label="Loading your plan" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const setPlan = (plan) => setData({ ...data, plan });

  if (!data.plan) {
    return <PlanWizard targets={data.targets || []} onboarding={onboarding} onCreated={setPlan} />;
  }
  return <PlanView plan={data.plan} onPlan={setPlan} onReset={() => setPlan(null)} />;
}

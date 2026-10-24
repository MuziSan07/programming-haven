import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";
import { PageLoader } from "@/components/ui";

export const metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <AuthForm mode="register" />
    </Suspense>
  );
}

import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";
import { PageLoader } from "@/components/ui";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <AuthForm mode="login" />
    </Suspense>
  );
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isAuthConfigured } from "@/lib/auth/server";
import { LoginClient } from "@/components/login-client";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const params = await searchParams;
  const authReady = isAuthConfigured();

  return <LoginClient authReady={authReady} error={params.error} />;
}

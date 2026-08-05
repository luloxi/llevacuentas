import { AppNav } from "@/components/app-nav";
import { AddExpenseProvider } from "@/components/add-expense-provider";
import { requireUser } from "@/lib/session";
import { isAdminEmail } from "@/lib/auth/allowlist";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="app-shell">
      <AddExpenseProvider>
        <AppNav isAdmin={isAdminEmail(user.email)} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 md:px-6 md:pb-10">
          {children}
        </main>
      </AddExpenseProvider>
    </div>
  );
}

import { Suspense } from "react";
import { AppNav } from "@/components/app-nav";
import { AddExpenseProvider } from "@/components/add-expense-provider";
import { SectionSwipe } from "@/components/section-swipe";
import { RegisterServiceWorker } from "@/components/register-sw";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();

  return (
    <div className="app-shell flex min-h-dvh flex-col">
      <RegisterServiceWorker />
      <AddExpenseProvider>
        <AppNav />
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 pb-24 md:px-6 md:pb-10">
          <Suspense fallback={null}>
            <SectionSwipe>{children}</SectionSwipe>
          </Suspense>
        </main>
      </AddExpenseProvider>
    </div>
  );
}

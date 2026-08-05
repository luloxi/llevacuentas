"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { AddExpenseModal } from "@/components/add-expense-modal";

type Category = { id: string; slug: string; name: string };
type Member = { userId: string; name: string };

export type AddExpensePreset = {
  categorySlug?: string;
  ownership?: "personal" | "shared";
  paidByUserId?: string;
  description?: string;
  /** Skip choose screen and open manual form directly */
  mode?: "manual" | "choose";
};

type Ctx = {
  openAddExpense: (preset?: AddExpensePreset) => void;
};

const AddExpenseContext = createContext<Ctx>({
  openAddExpense: () => {},
});

export function useAddExpense() {
  return useContext(AddExpenseContext);
}

export function AddExpenseProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [preset, setPreset] = useState<AddExpensePreset | null>(null);

  const loadMeta = useCallback(async () => {
    try {
      const res = await fetch("/api/transactions", { credentials: "include" });
      if (!res.ok) return;
      const text = await res.text();
      if (!text || text.trimStart().startsWith("<")) return;
      const data = JSON.parse(text) as {
        categories?: Category[];
        members?: Member[];
        viewerUserId?: string;
      };
      setCategories(data.categories ?? []);
      setMembers(data.members ?? []);
      if (data.viewerUserId) setViewerUserId(data.viewerUserId);
    } catch {
      // ignore
    }
  }, []);

  const openAddExpense = useCallback(
    (nextPreset?: AddExpensePreset) => {
      setPreset(nextPreset ?? null);
      setOpen(true);
      void loadMeta();
    },
    [loadMeta],
  );

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<AddExpensePreset | undefined>).detail;
      openAddExpense(detail);
    }
    window.addEventListener("lc:open-add-expense", onOpen);
    return () => window.removeEventListener("lc:open-add-expense", onOpen);
  }, [openAddExpense]);

  return (
    <AddExpenseContext.Provider value={{ openAddExpense }}>
      {children}
      <AddExpenseModal
        open={open}
        onClose={() => {
          setOpen(false);
          setPreset(null);
        }}
        onCreated={() => {
          setOpen(false);
          setPreset(null);
          window.dispatchEvent(new Event("lc:expense-created"));
        }}
        categories={categories}
        members={members}
        viewerUserId={viewerUserId}
        preset={preset}
      />
    </AddExpenseContext.Provider>
  );
}

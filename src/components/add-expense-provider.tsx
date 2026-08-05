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

type Ctx = {
  openAddExpense: () => void;
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

  const loadMeta = useCallback(async () => {
    try {
      const res = await fetch("/api/transactions", { credentials: "include" });
      if (!res.ok) return;
      const text = await res.text();
      if (!text || text.trimStart().startsWith("<")) return;
      const data = JSON.parse(text) as {
        categories?: Category[];
        members?: Member[];
      };
      setCategories(data.categories ?? []);
      setMembers(data.members ?? []);
    } catch {
      // ignore
    }
  }, []);

  const openAddExpense = useCallback(() => {
    setOpen(true);
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    function onOpen() {
      openAddExpense();
    }
    window.addEventListener("lc:open-add-expense", onOpen);
    return () => window.removeEventListener("lc:open-add-expense", onOpen);
  }, [openAddExpense]);

  return (
    <AddExpenseContext.Provider value={{ openAddExpense }}>
      {children}
      <AddExpenseModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          window.dispatchEvent(new Event("lc:expense-created"));
        }}
        categories={categories}
        members={members}
      />
    </AddExpenseContext.Provider>
  );
}

"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AdminMessages } from "@/lib/admin/i18n";

const AdminI18nContext = createContext<AdminMessages | null>(null);

interface AdminI18nProviderProps {
  messages: AdminMessages;
  children: ReactNode;
}

export function AdminI18nProvider({ messages, children }: AdminI18nProviderProps) {
  return <AdminI18nContext.Provider value={messages}>{children}</AdminI18nContext.Provider>;
}

export function useAdminMessages(): AdminMessages {
  const messages = useContext(AdminI18nContext);
  if (!messages) {
    throw new Error("useAdminMessages must be used within AdminI18nProvider");
  }
  return messages;
}

export function useAdminT() {
  const messages = useAdminMessages();
  return (key: keyof AdminMessages) => messages[key];
}

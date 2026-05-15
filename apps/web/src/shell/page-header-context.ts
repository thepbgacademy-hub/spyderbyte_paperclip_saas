import { createContext, type ReactNode } from "react";

export interface PageHeaderDefinition {
  eyebrow?: string | null;
  title: string;
  summary?: string | null;
}

export interface PageHeaderRegistration {
  eyebrow?: string | null;
  title?: string | null;
  summary?: string | null;
  afterTitle?: ReactNode;
  actions?: ReactNode;
}

export interface PageHeaderContextValue {
  setActions: (actions: ReactNode) => void;
  setAfterTitle: (afterTitle: ReactNode) => void;
  setEyebrow: (eyebrow: string | null) => void;
  setPageHeader: (header: PageHeaderRegistration | null) => void;
  setSummary: (summary: string | null) => void;
  setTitle: (title: string | null) => void;
}

export const PageHeaderContext = createContext<PageHeaderContextValue | null>(null);

import { useContext, useLayoutEffect } from "react";

import { PageHeaderContext, type PageHeaderRegistration } from "./page-header-context.js";

export type UsePageHeaderOptions = PageHeaderRegistration;

export function usePageHeader(options: UsePageHeaderOptions) {
  const context = useContext(PageHeaderContext);

  if (!context) {
    throw new Error("usePageHeader must be used within a PageHeaderProvider");
  }

  useLayoutEffect(() => {
    context.setPageHeader(options);

    return () => {
      context.setPageHeader(null);
    };
  }, [context, options.actions, options.afterTitle, options.eyebrow, options.summary, options.title]);

  return context;
}

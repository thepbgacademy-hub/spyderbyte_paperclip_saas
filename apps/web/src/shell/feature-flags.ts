export type HiddenShellFlag =
  | "showFutureAssistantStudio"
  | "showFutureOperations"
  | "showFutureAdvancedInsights";

export const HIDDEN_SHELL_FLAGS: Record<HiddenShellFlag, boolean> = {
  showFutureAssistantStudio: false,
  showFutureOperations: false,
  showFutureAdvancedInsights: false
};

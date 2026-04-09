export type CompareStatus = "pending" | "streaming" | "done" | "error" | "stopped";

export interface CompareMeta {
  enabled: boolean;
  selectedModels: string[];
  requestId: string;
  layout: "grid" | "list";
}

import { createContext, useContext } from "react";
import type { Bootstrap, Role } from "./types";

interface WorkspaceContext {
  bootstrap: Bootstrap;
  role: Role;
  setRole: (role: Role) => void;
  refresh: () => Promise<Bootstrap | undefined>;
}
export const Workspace = createContext<WorkspaceContext | null>(null);
export function useWorkspace() {
  const context = useContext(Workspace);
  if (!context) throw new Error("Workspace provider is missing");
  return context;
}

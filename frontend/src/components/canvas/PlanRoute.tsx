import { PlanningWorkspace } from "@/components/canvas/PlanningWorkspace";
import { useWorkspaceSession } from "@/context/WorkspaceSessionContext";

/** Remounts when sidebar “new plan” or header New is used. */
export function PlanRoute() {
  const { sessionId } = useWorkspaceSession();
  return <PlanningWorkspace key={sessionId} />;
}

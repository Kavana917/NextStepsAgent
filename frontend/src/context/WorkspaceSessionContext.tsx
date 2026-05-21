import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type WorkspaceSessionContextValue = {
  sessionId: number;
  /** Start a blank canvas (remounts planning workspace). Saved plans stay in Recent. */
  startNewPlan: () => void;
};

const WorkspaceSessionContext =
  createContext<WorkspaceSessionContextValue | null>(null);

export function WorkspaceSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sessionId, setSessionId] = useState(0);

  const startNewPlan = useCallback(() => {
    setSessionId((id) => id + 1);
  }, []);

  const value = useMemo(
    () => ({ sessionId, startNewPlan }),
    [sessionId, startNewPlan],
  );

  return (
    <WorkspaceSessionContext.Provider value={value}>
      {children}
    </WorkspaceSessionContext.Provider>
  );
}

export function useWorkspaceSession(): WorkspaceSessionContextValue {
  const ctx = useContext(WorkspaceSessionContext);
  if (!ctx) {
    throw new Error("useWorkspaceSession must be used within WorkspaceSessionProvider");
  }
  return ctx;
}

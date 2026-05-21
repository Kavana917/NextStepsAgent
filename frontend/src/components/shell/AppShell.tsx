import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { WorkspaceSessionProvider, useWorkspaceSession } from "@/context/WorkspaceSessionContext";

export function AppShell() {
  return (
    <WorkspaceSessionProvider>
      <AppShellInner />
    </WorkspaceSessionProvider>
  );
}

function AppShellInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { startNewPlan } = useWorkspaceSession();
  const onPlanPage = location.pathname === "/plan";

  function handleNewPlan() {
    // Remounts PlanningWorkspace (blank canvas). Plans already saved via Generate stay in Recent.
    startNewPlan();
    if (!onPlanPage) {
      navigate("/plan");
    }
  }

  return (
    <div className="flex min-h-dvh bg-zinc-950 text-zinc-50">
      <nav className="flex w-14 shrink-0 flex-col items-center border-r border-zinc-800 bg-zinc-950 py-4 sm:w-16">
        <div
          className="mb-6 flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600/20 text-xs font-bold text-sky-400"
          title="Next Steps Agent"
        >
          NS
        </div>
        <button
          type="button"
          onClick={handleNewPlan}
          className={`flex w-full flex-col items-center gap-1 px-1 py-2 text-[10px] font-medium leading-tight transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 ${
            onPlanPage
              ? "text-sky-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
          title="New plan"
          aria-label="New plan"
        >
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-lg border text-lg leading-none ${
              onPlanPage
                ? "border-sky-600/50 bg-sky-950/40"
                : "border-zinc-700 bg-zinc-900"
            }`}
          >
            +
          </span>
          <span className="text-center">Plan</span>
        </button>
      </nav>
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}

import { Link } from "react-router-dom";

export function LandingPage() {
  return (
    <div className="flex min-h-[calc(100dvh-0px)] flex-col items-center justify-center px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-wider text-sky-400">
        Next Steps Agent
      </p>
      <h1 className="mt-3 max-w-lg text-balance text-center text-3xl font-semibold tracking-tight text-white">
        Turn situations into actionable plans
      </h1>
      <p className="mt-4 max-w-md text-center text-sm leading-relaxed text-zinc-400">
        Map your situation on a canvas, add planning context, and generate a
        free-form tree of steps you can refine at any branch.
      </p>
      <Link
        to="/plan"
        className="mt-8 inline-flex items-center justify-center rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-900/40 hover:bg-sky-500"
      >
        Start planning
      </Link>
    </div>
  );
}

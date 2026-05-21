import { Navigate } from "react-router-dom";

/** Legacy entry — canvas workspace lives at /plan. */
export function HomePage() {
  return <Navigate to="/plan" replace />;
}

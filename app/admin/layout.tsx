// Phase 7A — Step 1: passthrough layout.
//
// Exists only to establish the nested-routing scaffold under /admin before
// any sections are split into sibling routes. Intentionally a server
// component with no state, no auth, no sidebar, no data fetching — it
// simply renders whatever page sits below it. Subsequent steps will move
// PasswordGate, the top bar, and the AdminDataProvider into this file.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

"use client";
import { usePathname, useRouter } from "next/navigation";
import { Banner, Button, T, useIsMobile } from "@/components/ops/ui";
import { useOps } from "@/components/ops/OpsProvider";
import SignIn from "@/components/ops/SignIn";

interface NavItem { href: string; label: string; ownerOnly?: boolean; group?: "setup" }

const NAV: NavItem[] = [
  { href: "/ops", label: "Today" },
  { href: "/ops/enquiries", label: "Enquiries" },
  { href: "/ops/bookings", label: "Bookings" },
  { href: "/ops/availability", label: "Availability" },
  { href: "/ops/pricing", label: "Pricing", ownerOnly: true, group: "setup" },
  { href: "/ops/extras", label: "Extras", ownerOnly: true, group: "setup" },
  { href: "/ops/payments", label: "Payments", ownerOnly: true, group: "setup" },
  { href: "/ops/team", label: "Team", ownerOnly: true, group: "setup" },
];

export default function OpsShell({ children }: { children: React.ReactNode }) {
  const { status, blocked, me, signOut, signOutError, loadError, refresh } = useOps();
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();

  if (status === "checking") {
    return (
      <main style={{ background: T.navyDeep, minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div style={{ color: T.faint, fontSize: "13px", letterSpacing: "2px", textTransform: "uppercase" }}>Loading…</div>
      </main>
    );
  }

  // A network failure is not a sign-out. Showing the login form here would tell
  // an operator with a valid session that they are logged out.
  if (status === "unreachable") {
    return (
      <main style={{ background: T.navyDeep, minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px" }}>
        <div style={{ width: "min(460px,100%)" }}>
          <Banner
            tone="bad"
            title={blocked?.kind === "server" ? "Oraya couldn't answer" : "Can't reach Oraya"}
            onRetry={() => window.location.reload()}
          >
            {blocked?.kind === "server" ? (
              <>
                {blocked.message || `The server replied with an error (${blocked.status}).`}{" "}
                You have not been signed out.
              </>
            ) : (
              <>We couldn&apos;t check your session. This is a connection problem — you have not been signed out.</>
            )}
          </Banner>
        </div>
      </main>
    );
  }

  if (status === "signed-out" || !me) return <SignIn />;

  const visible = NAV.filter((n) => !n.ownerOnly || me.role === "owner");
  const primary = visible.filter((n) => !n.group);
  const setup = visible.filter((n) => n.group === "setup");
  const isActive = (href: string) => (href === "/ops" ? pathname === "/ops" : pathname.startsWith(href));

  const navButton = (n: NavItem) => (
    <button
      key={n.href}
      onClick={() => router.push(n.href)}
      aria-current={isActive(n.href) ? "page" : undefined}
      style={{
        display: "flex", alignItems: "center", width: "100%", background: isActive(n.href) ? "rgba(197,164,109,.14)" : "none",
        border: 0, color: isActive(n.href) ? T.gold : T.ink2, fontWeight: isActive(n.href) ? 600 : 400,
        fontSize: "14px", padding: "11px 12px", borderRadius: T.rSm, cursor: "pointer", textAlign: "left",
      }}
    >
      {n.label}
    </button>
  );

  return (
    <div style={{ background: T.navyDeep, minHeight: "100vh", color: T.ink, fontFamily: T.sans }}>
      <div style={{ display: isMobile ? "block" : "grid", gridTemplateColumns: isMobile ? undefined : "236px 1fr", minHeight: "100vh" }}>
        {!isMobile && (
          <aside style={{
            background: T.navy, borderRight: `1px solid ${T.borderFaint}`, padding: "24px 16px",
            display: "flex", flexDirection: "column", gap: "28px", position: "sticky", top: 0, height: "100vh",
          }}>
            <div style={{ paddingLeft: "8px" }}>
              <div style={{ fontFamily: T.serif, fontSize: "21px", color: T.gold, letterSpacing: ".5px" }}>ORAYA</div>
              <div style={{ fontSize: "9px", letterSpacing: "2.4px", textTransform: "uppercase", color: T.faint, marginTop: "3px" }}>Operations</div>
            </div>
            <nav style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {primary.map(navButton)}
              {setup.length > 0 && (
                <>
                  <div style={{ fontSize: "9px", letterSpacing: "2.4px", textTransform: "uppercase", color: T.faint, padding: "16px 12px 6px" }}>Setup</div>
                  {setup.map(navButton)}
                </>
              )}
            </nav>
            <div style={{ marginTop: "auto", borderTop: `1px solid ${T.borderFaint}`, paddingTop: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "999px", background: T.gold, color: T.onGold, display: "grid", placeItems: "center", fontWeight: 700, fontSize: "13px" }}>
                  {me.full_name.charAt(0).toUpperCase()}
                </div>
                <div style={{ fontSize: "13px", lineHeight: 1.3, minWidth: 0 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{me.full_name.split(" ")[0]}</div>
                  <span style={{ display: "block", fontSize: "10px", letterSpacing: "1.6px", textTransform: "uppercase", color: T.faint }}>
                    {me.role === "owner" ? "Owner" : "Operator"}
                  </span>
                </div>
              </div>
              <Button small wide onClick={() => void signOut()}>Sign out</Button>
            </div>
          </aside>
        )}

        <main style={{ padding: isMobile ? "18px 16px 92px" : "28px 32px 96px", maxWidth: "1180px" }}>
          {signOutError && <Banner tone="bad" title="Still signed in">{signOutError}</Banner>}
          {loadError && (
            <Banner tone="bad" title="Couldn't refresh" onRetry={() => void refresh()}>
              {loadError} What you see below may be out of date.
            </Banner>
          )}
          {children}
        </main>
      </div>

      {isMobile && (
        <nav style={{
          position: "fixed", bottom: 0, left: 0, right: 0, background: T.navy,
          borderTop: `1px solid ${T.borderFaint}`, display: "grid",
          gridTemplateColumns: `repeat(${Math.min(visible.length, 5)},1fr)`, zIndex: 60,
        }}>
          {visible.slice(0, 5).map((n) => (
            <button
              key={n.href}
              onClick={() => router.push(n.href)}
              aria-current={isActive(n.href) ? "page" : undefined}
              style={{
                background: "none", border: 0, color: isActive(n.href) ? T.gold : T.muted,
                fontSize: "11px", padding: "13px 4px", cursor: "pointer",
              }}
            >
              {n.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

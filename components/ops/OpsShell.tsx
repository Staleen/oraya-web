"use client";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Banner, Button, T, useIsMobile } from "@/components/ops/ui";
import { useOps } from "@/components/ops/OpsProvider";
import SignIn from "@/components/ops/SignIn";
import OpsIcon, { type IconName } from "@/components/ops/OpsIcons";

interface NavItem { href: string; label: string; icon: IconName; ownerOnly?: boolean; group?: "setup" }

const NAV: NavItem[] = [
  { href: "/ops", label: "Today", icon: "today" },
  { href: "/ops/enquiries", label: "Enquiries", icon: "enquiries" },
  { href: "/ops/bookings", label: "Bookings", icon: "bookings" },
  { href: "/ops/availability", label: "Availability", icon: "availability" },
  { href: "/ops/business", label: "Business", icon: "business", ownerOnly: true },
  { href: "/ops/pricing", label: "Pricing", icon: "pricing", ownerOnly: true, group: "setup" },
  { href: "/ops/extras", label: "Extras", icon: "extras", ownerOnly: true, group: "setup" },
  { href: "/ops/payments", label: "Payments", icon: "payments", ownerOnly: true, group: "setup" },
  { href: "/ops/media", label: "Photos", icon: "photos", ownerOnly: true, group: "setup" },
  { href: "/ops/site", label: "Site", icon: "site", ownerOnly: true, group: "setup" },
  { href: "/ops/members", label: "Members", icon: "members", ownerOnly: true, group: "setup" },
  { href: "/ops/team", label: "Team", icon: "team", ownerOnly: true, group: "setup" },
  { href: "/ops/account", label: "Your account", icon: "account", group: "setup" },
];

/** Home-indicator clearance on iPhones; 0 everywhere else. */
const SAFE_BOTTOM = "env(safe-area-inset-bottom, 0px)";

export default function OpsShell({ children }: { children: React.ReactNode }) {
  const { status, blocked, me, signOut, signOutError, loadError, refresh } = useOps();
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [moreOpen, setMoreOpen] = useState(false);

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
        display: "flex", alignItems: "center", gap: "11px", width: "100%",
        background: isActive(n.href) ? "rgba(197,164,109,.14)" : "none",
        border: 0, color: isActive(n.href) ? T.gold : T.ink2, fontWeight: isActive(n.href) ? 600 : 400,
        fontSize: "14px", padding: "11px 12px", borderRadius: T.rSm, cursor: "pointer", textAlign: "left",
      }}
    >
      <OpsIcon name={n.icon} size={19} />
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

        {/* Bottom padding on mobile clears the nav bar AND the home indicator,
            so the last row of a list is never trapped underneath either. */}
        <main style={{
          padding: isMobile ? "18px 16px" : "28px 32px 96px",
          paddingBottom: isMobile ? `calc(104px + ${SAFE_BOTTOM})` : undefined,
          maxWidth: "1180px",
        }}>
          {signOutError && <Banner tone="bad" title="Still signed in">{signOutError}</Banner>}
          {loadError && (
            <Banner tone="bad" title="Couldn't refresh" onRetry={() => void refresh()}>
              {loadError} What you see below may be out of date.
            </Banner>
          )}
          {children}
        </main>
      </div>

      {/*
        Mobile navigation. The bar previously showed `visible.slice(0, 5)`,
        which silently hid everything after the fifth item — for an owner that
        was every Setup screen, so Pricing, Extras, Payments, Photos, Site,
        Members and Team were unreachable from a phone. The bar now carries the
        day-to-day screens and a "More" sheet holds the rest, so nothing the
        role can see is unreachable on the device it is most often used on.
      */}
      {isMobile && (() => {
        const bar = primary.slice(0, 4);
        const rest = [...primary.slice(4), ...setup];
        const columns = bar.length + (rest.length > 0 ? 1 : 0);
        return (
          <>
            {moreOpen && rest.length > 0 && (
              <div
                onClick={(e) => { if (e.target === e.currentTarget) setMoreOpen(false); }}
                style={{ position: "fixed", inset: 0, background: "rgba(10,15,20,.72)", zIndex: 70, display: "flex", alignItems: "flex-end" }}
              >
                <div style={{
                  background: T.navyLift, borderTop: `1px solid ${T.border}`,
                  borderRadius: `${T.rLg} ${T.rLg} 0 0`, width: "100%",
                  padding: `20px 16px calc(96px + ${SAFE_BOTTOM})`,
                  maxHeight: "78vh", overflowY: "auto",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <span style={{ fontSize: "10px", letterSpacing: "2.4px", textTransform: "uppercase", color: T.gold }}>More</span>
                    <button onClick={() => setMoreOpen(false)} aria-label="Close"
                      style={{
                        background: "none", border: 0, color: T.muted, fontSize: "26px", lineHeight: 1,
                        cursor: "pointer", padding: "6px 10px", margin: "-6px -10px",
                      }}>&times;</button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {rest.map((n) => (
                      <button
                        key={n.href}
                        onClick={() => { setMoreOpen(false); router.push(n.href); }}
                        aria-current={isActive(n.href) ? "page" : undefined}
                        style={{
                          display: "flex", alignItems: "center", gap: "13px", width: "100%",
                          background: isActive(n.href) ? "rgba(197,164,109,.14)" : "none", border: 0,
                          color: isActive(n.href) ? T.gold : T.ink2, fontSize: "16px",
                          padding: "15px 12px", borderRadius: T.rSm, cursor: "pointer", textAlign: "left",
                        }}
                      >
                        <OpsIcon name={n.icon} size={21} />
                        {n.label}
                      </button>
                    ))}
                    <button
                      onClick={() => { setMoreOpen(false); void signOut(); }}
                      style={{
                        marginTop: "12px", background: "none", border: `1px solid ${T.borderStrong}`,
                        color: T.ink2, fontSize: "15px", padding: "15px 12px", borderRadius: T.rSm, cursor: "pointer",
                      }}
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/*
              Each destination is an icon over a label in a 56px-tall column.
              The previous bar was an 11px word with 13px of padding — roughly
              a 34px target, well under the 44px Apple asks for, and nothing to
              aim at but the text itself.

              The bar sits above the home indicator rather than under it: the
              safe-area inset is added as padding, so the buttons stay
              reachable and the strip below them is just background.
            */}
            <nav style={{
              position: "fixed", bottom: 0, left: 0, right: 0, background: T.navy,
              borderTop: `1px solid ${T.borderFaint}`, display: "grid",
              gridTemplateColumns: `repeat(${columns},1fr)`, zIndex: 80,
              paddingBottom: SAFE_BOTTOM,
            }}>
              {bar.map((n) => {
                const on = isActive(n.href);
                return (
                  <button
                    key={n.href}
                    onClick={() => { setMoreOpen(false); router.push(n.href); }}
                    aria-current={on ? "page" : undefined}
                    aria-label={n.label}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      gap: "4px", minHeight: "56px", padding: "8px 2px",
                      background: "none", border: 0, color: on ? T.gold : T.muted,
                      fontSize: "10.5px", fontWeight: on ? 600 : 400, letterSpacing: ".2px",
                      fontFamily: T.sans, cursor: "pointer",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <OpsIcon name={n.icon} size={22} />
                    <span style={{ lineHeight: 1 }}>{n.label}</span>
                  </button>
                );
              })}
              {rest.length > 0 && (() => {
                const on = moreOpen || rest.some((n) => isActive(n.href));
                return (
                  <button
                    onClick={() => setMoreOpen((v) => !v)}
                    aria-expanded={moreOpen}
                    aria-label="More screens"
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      gap: "4px", minHeight: "56px", padding: "8px 2px",
                      background: "none", border: 0, color: on ? T.gold : T.muted,
                      fontSize: "10.5px", fontWeight: on ? 600 : 400, letterSpacing: ".2px",
                      fontFamily: T.sans, cursor: "pointer",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <OpsIcon name="more" size={22} />
                    <span style={{ lineHeight: 1 }}>More</span>
                  </button>
                );
              })()}
            </nav>
          </>
        );
      })()}
    </div>
  );
}

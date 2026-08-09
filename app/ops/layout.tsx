import { OpsProvider } from "@/components/ops/OpsProvider";
import OpsShell from "@/components/ops/OpsShell";

export const metadata = { title: "Oraya — Operations" };

/**
 * `ops-scope` is what lets one stylesheet rule reach a console built almost
 * entirely from inline styles. It pins the colour scheme so native dropdowns
 * stay readable regardless of the public site's light/dark toggle, and it
 * carries the phone-sizing rules in globals.css.
 */
export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ops-scope">
      <OpsProvider>
        <OpsShell>{children}</OpsShell>
      </OpsProvider>
    </div>
  );
}

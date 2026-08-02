import { OpsProvider } from "@/components/ops/OpsProvider";
import OpsShell from "@/components/ops/OpsShell";

export const metadata = { title: "Oraya — Operations" };

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <OpsProvider>
      <OpsShell>{children}</OpsShell>
    </OpsProvider>
  );
}

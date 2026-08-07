"use client";
import { Card, PageHead } from "@/components/ops/ui";

export default function Page() {
  return (
    <>
      <PageHead title="Extras" sub="Being built next" />
      <Card>
        <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.6 }}>
          This screen is next in the build. The approved prototype shows what it will become.
        </p>
      </Card>
    </>
  );
}

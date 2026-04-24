"use client";
import { useEffect, useState } from "react";
import AddonsEditor from "@/components/admin/AddonsEditor";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { LATO } from "@/components/admin/theme";
import type { Addon } from "@/components/admin/types";

export default function AdminRatesPage() {
  const { error, setError } = useAdminData();
  const [addons, setAddons] = useState<Addon[]>([]);
  const [addonsSaving, setAddonsSaving] = useState(false);
  const [addonsSaved, setAddonsSaved] = useState(false);

  useEffect(() => {
    fetch("/api/addons", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.addons)) setAddons(d.addons); })
      .catch((e) => console.error("[admin] addons fetch error:", e));
  }, []);

  function updateAddon(id: string, patch: Partial<Addon>) {
    setAddons((prev) => prev.map((a) => a.id === id ? { ...a, ...patch } : a));
    setAddonsSaved(false);
  }

  async function saveAddons() {
    setAddonsSaving(true);
    setAddonsSaved(false);
    const res = await fetch("/api/admin/addons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addons }),
    });
    setAddonsSaving(false);
    if (res.ok) {
      setAddonsSaved(true);
      setTimeout(() => setAddonsSaved(false), 3000);
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to save add-ons.");
    }
  }

  return (
    <>
      {error && (
        <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", marginBottom: "1.5rem" }}>
          Error: {error}
        </p>
      )}
      <AddonsEditor
        addons={addons}
        addonsSaving={addonsSaving}
        addonsSaved={addonsSaved}
        updateAddon={updateAddon}
        saveAddons={saveAddons}
      />
    </>
  );
}

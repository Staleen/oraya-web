"use client";
import { useState } from "react";
import MembersTable from "@/components/admin/MembersTable";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { LATO } from "@/components/admin/theme";
import { adminApiFetchInit } from "@/lib/admin-auth";

export default function AdminMembersPage() {
  const { members, setMembers, loading, error, setError } = useAdminData();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deleteMember(id: string, name: string) {
    if (!confirm(`Delete member "${name}"? This will permanently remove their account and they will not be able to sign in again.`)) return;
    setError("");
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/members/${id}`, { ...adminApiFetchInit, method: "DELETE" });
      let data: { error?: string } = {};
      try {
        data = (await res.json()) as { error?: string };
      } catch {
        data = {};
      }
      if (!res.ok) {
        setError(data.error ?? "Failed to delete member.");
        return;
      }
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } catch {
      setError("Failed to delete member.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {error && (
        <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", marginBottom: "1.5rem" }}>
          Error: {error}
        </p>
      )}
      <MembersTable
        loading={loading}
        members={members}
        deletingId={deletingId}
        deleteMember={deleteMember}
      />
    </>
  );
}

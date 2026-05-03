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
    setDeletingId(id);
    const res = await fetch(`/api/admin/members/${id}`, { ...adminApiFetchInit, method: "DELETE" });
    setDeletingId(null);
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to delete member.");
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

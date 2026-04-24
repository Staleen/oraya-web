"use client";
import AdminDataProvider from "@/components/admin/AdminDataProvider";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminDataProvider>{children}</AdminDataProvider>;
}

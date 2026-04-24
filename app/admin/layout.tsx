"use client";
import AdminChrome from "@/components/admin/AdminChrome";
import AdminDataProvider from "@/components/admin/AdminDataProvider";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminDataProvider>
      <AdminChrome>{children}</AdminChrome>
    </AdminDataProvider>
  );
}

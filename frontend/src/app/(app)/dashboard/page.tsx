import type { Metadata } from "next";

import { FilesDashboard } from "@/components/files/FilesDashboard";

export const metadata: Metadata = { title: "Your files" };

export default function DashboardPage() {
  return <FilesDashboard />;
}

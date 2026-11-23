import type { Metadata } from "next";

import { DashboardPlaceholder } from "@/components/DashboardPlaceholder";

export const metadata: Metadata = { title: "Your files" };

export default function DashboardPage() {
  return <DashboardPlaceholder />;
}

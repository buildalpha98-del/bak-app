"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { bulkCreateBookableSessions, getCoachesForDropdown } from "@/lib/bookings/actions";
import { BulkCreateForm } from "@/components/bookings/bulk-create-form";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "@/components/ui/app-link";

export default function AdminBulkCreatePage() {
  const router = useRouter();
  const [coaches, setCoaches] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    getCoachesForDropdown().then(({ data }) => setCoaches(data));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" render={<Link href="/admin/bookings/sessions" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Create Holiday Clinic Series</h1>
          <p className="text-sm text-muted-foreground">
            Bulk create sessions across a date range
          </p>
        </div>
      </div>
      <BulkCreateForm
        coaches={coaches}
        onSubmit={async (data) => {
          const result = await bulkCreateBookableSessions(data);
          if (result.error) {
            toast.error("Could not create sessions. Please try again.");
          } else {
            toast.success(`${result.data.length} sessions created.`);
            router.push("/admin/bookings/sessions");
          }
          return result;
        }}
      />
    </div>
  );
}

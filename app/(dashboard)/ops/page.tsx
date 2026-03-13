import { RecentFeedbackWidget } from "@/components/feedback/recent-feedback-widget";

export default async function OpsDashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-[#1A1A1A]">Operations Dashboard</h1>
      <p className="mt-2 text-[#666666]">
        Welcome to the Build Alpha Kids operations portal.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <RecentFeedbackWidget />
      </div>
    </div>
  );
}

import { getTermList } from "@/lib/terms/actions";
import { TermListView } from "@/components/roster/term-list-view";

export default async function AdminTermsPage() {
  const { data, error } = await getTermList();

  if (error || !data) {
    return (
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Terms</h1>
        <p className="mt-2 text-red-600">{error ?? "Failed to load terms."}</p>
      </div>
    );
  }

  return <TermListView initialData={data} basePath="/admin/roster/terms" />;
}

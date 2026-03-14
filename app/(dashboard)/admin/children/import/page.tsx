import { getCentreList } from "@/lib/centres/actions";
import { CsvImportView } from "@/components/children/csv-import-view";

export const metadata = {
  title: "Import Children — Build Alpha Kids",
};

export default async function AdminChildrenImportPage() {
  const { data: centres } = await getCentreList();

  return (
    <div className="container max-w-4xl py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Children</h1>
        <p className="text-sm text-muted-foreground">
          Upload a CSV file to bulk-import children into a centre.
        </p>
      </div>

      <CsvImportView
        centres={(centres ?? []).map((c) => ({ id: c.id, name: c.name }))}
        basePath="/admin/children"
      />
    </div>
  );
}

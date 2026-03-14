import { getRateCard } from "@/lib/staff/actions";
import { RateCardView } from "@/components/staff/rate-card-view";

export default async function RateCardPage() {
  const { data, error } = await getRateCard();

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Rate Card</h1>
        <p className="mt-2 text-red-600">Failed to load rate card: {error}</p>
      </div>
    );
  }

  return <RateCardView initialData={data ?? []} />;
}

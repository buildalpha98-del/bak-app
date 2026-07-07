import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getActiveRerosteringEvents } from "@/lib/rerostering/actions";
import {
  RerosteringCommandCentre,
  type CommandCentreEvent,
} from "@/components/roster/rerostering-command-centre";

export const dynamic = "force-dynamic";

export default async function OpsRerosteringPage() {
  const events = await getActiveRerosteringEvents();

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <Link
          href="/ops/roster"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to roster
        </Link>
        <h1 className="text-3xl font-bold font-heading tracking-tight text-foreground">
          Rerostering
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Every session still needing a coach, with live offer countdowns and
          ranked replacement candidates.
        </p>
      </div>

      <RerosteringCommandCentre
        events={events as unknown as CommandCentreEvent[]}
      />
    </div>
  );
}

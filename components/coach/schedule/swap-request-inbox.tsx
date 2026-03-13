"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowRightLeft, Check, X, Loader2 } from "lucide-react";
import { respondToSwapRequest } from "@/lib/sessions/shift-actions";
import type { IncomingSwapRequest } from "@/lib/sessions/shift-actions";
import { formatTime12, formatDateShort } from "@/lib/utils/roster";

// ============================================================
// Props
// ============================================================

interface SwapRequestInboxProps {
  requests: IncomingSwapRequest[];
}

// ============================================================
// Single request card
// ============================================================

function SwapRequestCard({ request }: { request: IncomingSwapRequest }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRespond(accept: boolean) {
    startTransition(async () => {
      await respondToSwapRequest(request.swap_request_id, accept);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border-2 border-amber-300 bg-amber-50/50 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <ArrowRightLeft className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {request.requesting_coach_name} requests you cover:
          </p>
          <p className="text-sm text-muted-foreground">
            {request.session_sport} —{" "}
            {formatDateShort(request.session_date)} at{" "}
            {formatTime12(request.session_time)}
          </p>
          <p className="text-xs text-muted-foreground">
            {request.centre_name}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => handleRespond(true)}
          disabled={isPending}
          className="min-h-[44px] flex-1 bg-green-600 hover:bg-green-700 text-white"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <Check className="mr-1 size-4" />
              Accept
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleRespond(false)}
          disabled={isPending}
          className="min-h-[44px] flex-1 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <X className="mr-1 size-4" />
              Decline
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Main component
// ============================================================

export function SwapRequestInbox({ requests }: SwapRequestInboxProps) {
  if (requests.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ArrowRightLeft className="size-4 text-amber-600" />
        <h2 className="text-sm font-semibold text-foreground">
          Swap Requests ({requests.length})
        </h2>
      </div>

      <div className="space-y-2">
        {requests.map((req) => (
          <SwapRequestCard key={req.swap_request_id} request={req} />
        ))}
      </div>
    </div>
  );
}

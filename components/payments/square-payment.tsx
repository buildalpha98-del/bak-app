"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, AlertCircle } from "lucide-react";

declare global {
  interface Window {
    Square?: {
      payments: (
        appId: string,
        locationId: string
      ) => Promise<{
        card: () => Promise<{
          attach: (selector: string) => Promise<void>;
          tokenize: () => Promise<{
            status: string;
            token?: string;
            errors?: Array<{ message: string }>;
          }>;
        }>;
      }>;
    };
  }
}

interface SquarePaymentProps {
  amountCents: number;
  onPaymentSuccess: (paymentId: string) => void;
  onPaymentError: (error: string) => void;
  idempotencyKey: string;
  bookingId?: string;
  packageId?: string;
}

type CardInstance = Awaited<
  ReturnType<Awaited<ReturnType<NonNullable<Window["Square"]>["payments"]>>["card"]>
>;

export function SquarePayment({
  amountCents,
  onPaymentSuccess,
  onPaymentError,
  idempotencyKey,
  bookingId,
  packageId,
}: SquarePaymentProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSdkReady, setIsSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const cardRef = useRef<CardInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  const formattedAmount = (amountCents / 100).toFixed(2);

  // Load Square Web Payments SDK
  useEffect(() => {
    if (document.getElementById("square-web-payments-sdk")) {
      // Script already loaded
      if (window.Square) {
        setIsSdkReady(true);
      }
      return;
    }

    const script = document.createElement("script");
    script.id = "square-web-payments-sdk";
    script.src = "https://sandbox.web.squarecdn.com/v1/square.js";
    script.async = true;

    script.onload = () => {
      setIsSdkReady(true);
    };

    script.onerror = () => {
      setSdkError("Failed to load payment form. Please refresh and try again.");
    };

    document.head.appendChild(script);
  }, []);

  // Initialise card payment element once SDK is ready
  useEffect(() => {
    if (!isSdkReady || !window.Square || initializedRef.current) return;

    const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID;
    const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID;

    if (!appId || !locationId) {
      setSdkError("Payment configuration is missing. Please contact support.");
      return;
    }

    async function initCard() {
      try {
        initializedRef.current = true;
        const payments = await window.Square!.payments(appId!, locationId!);
        const card = await payments.card();
        await card.attach("#square-card-container");
        cardRef.current = card;
      } catch {
        setSdkError("Failed to initialise payment form. Please refresh and try again.");
        initializedRef.current = false;
      }
    }

    initCard();
  }, [isSdkReady]);

  const handlePayment = useCallback(async () => {
    if (!cardRef.current) {
      onPaymentError("Payment form is not ready. Please wait and try again.");
      return;
    }

    setIsLoading(true);

    try {
      // Tokenize the card
      const tokenResult = await cardRef.current.tokenize();

      if (tokenResult.status !== "OK" || !tokenResult.token) {
        const errorMessage =
          tokenResult.errors?.[0]?.message ||
          "Card details are invalid. Please check and try again.";
        onPaymentError(errorMessage);
        setIsLoading(false);
        return;
      }

      // Call the payment API
      const response = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: tokenResult.token,
          amountCents,
          idempotencyKey,
          bookingId,
          packageId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        onPaymentError(data.error || "Payment failed. Please try again.");
        setIsLoading(false);
        return;
      }

      onPaymentSuccess(data.paymentId || data.squarePaymentId);
    } catch {
      onPaymentError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [amountCents, idempotencyKey, bookingId, packageId, onPaymentSuccess, onPaymentError]);

  if (sdkError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 size-5 text-red-600" />
          <div>
            <p className="text-sm font-medium text-red-800">Payment Unavailable</p>
            <p className="mt-1 text-sm text-red-600">{sdkError}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#1A1A1A]">
          <CreditCard className="size-4" />
          Card Details
        </div>

        <div
          id="square-card-container"
          ref={containerRef}
          className="min-h-[90px]"
        >
          {!isSdkReady && (
            <div className="flex h-[90px] items-center justify-center">
              <Loader2 className="size-5 animate-spin text-[#666666]" />
              <span className="ml-2 text-sm text-[#666666]">
                Loading payment form...
              </span>
            </div>
          )}
        </div>
      </div>

      <Button
        onClick={handlePayment}
        disabled={isLoading || !isSdkReady || !cardRef.current}
        className="h-12 w-full text-base font-semibold"
        style={{ backgroundColor: "#E8712A", color: "#FFFFFF" }}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 size-5 animate-spin" />
            Processing...
          </>
        ) : (
          <>Pay ${formattedAmount}</>
        )}
      </Button>

      <p className="text-center text-xs text-[#666666]">
        Your payment is processed securely via Square.
      </p>
    </div>
  );
}

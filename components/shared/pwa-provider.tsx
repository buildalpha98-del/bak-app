"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/offline/sw-register";

export function PWAProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return <>{children}</>;
}

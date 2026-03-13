import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { PWAProvider } from "@/components/shared/pwa-provider";

const heading = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Build Alpha Kids",
  description:
    "Multi-sport coaching platform for Build Alpha Kids — managing workforce operations across childcare centres and schools.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Build Alpha Kids",
  },
};

export const viewport: Viewport = {
  themeColor: "#E8712A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-AU"
      className={cn("font-sans", heading.variable, body.variable)}
    >
      <body className="antialiased">
        <PWAProvider>
          <TooltipProvider delay={300}>{children}</TooltipProvider>
          <Toaster position="top-right" richColors closeButton />
        </PWAProvider>
      </body>
    </html>
  );
}

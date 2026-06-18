import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { PWAProvider } from "@/components/shared/pwa-provider";
import { ThemeProvider } from "next-themes";

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

// Apple splash images. iOS Safari prefers an exact viewport match; we
// pre-generate one PNG per common device class. Where a real device
// doesn't match exactly, iOS falls back gracefully to the closest size.
//
// Note: these PNGs are currently brand-orange solid placeholders rendered
// by `scripts/generate-pwa-assets.mjs`. Real designer-made splash art is
// a Wave B item — see public/README-pwa-assets.md.
const APPLE_SPLASH = [
  { url: "/splash/apple-splash-1284-2778.png", w: 1284, h: 2778, pxRatio: 3 }, // iPhone 14 Pro Max
  { url: "/splash/apple-splash-1170-2532.png", w: 1170, h: 2532, pxRatio: 3 }, // iPhone 14 Pro / 13 Pro
  { url: "/splash/apple-splash-1125-2436.png", w: 1125, h: 2436, pxRatio: 3 }, // iPhone X / 11 Pro
  { url: "/splash/apple-splash-828-1792.png", w: 828, h: 1792, pxRatio: 2 }, // iPhone 11 / XR
  { url: "/splash/apple-splash-1640-2360.png", w: 1640, h: 2360, pxRatio: 2 }, // iPad Pro 11" portrait
];

export const metadata: Metadata = {
  title: "Build Alpha Kids",
  description:
    "Multi-sport coaching platform for Build Alpha Kids — managing workforce operations across childcare centres and schools.",
  manifest: "/manifest.json",
  // Standalone-mode iOS uses black-translucent so the status bar floats
  // over our top-bar gradient instead of carving out a white band.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Build Alpha Kids",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" },
      { url: "/icons/apple-touch-icon-152.png", sizes: "152x152", type: "image/png" },
      { url: "/icons/apple-touch-icon-167.png", sizes: "167x167", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#E8712A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // viewport-fit=cover is required for `env(safe-area-inset-*)` to produce
  // non-zero values on iPhones with a notch / dynamic island when in
  // standalone PWA mode. Without it iOS clips content into the safe region
  // and our inset reads always return 0.
  viewportFit: "cover",
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
      suppressHydrationWarning
    >
      <head>
        {/*
          Apple-touch-startup-image — Next's Metadata API doesn't model these
          first-class because each <link> needs a different `media` query.
          Rendering them here from the root layout is the canonical pattern.
        */}
        {APPLE_SPLASH.map((s) => (
          <link
            key={s.url}
            rel="apple-touch-startup-image"
            href={s.url}
            media={`(device-width: ${Math.round(s.w / s.pxRatio)}px) and (device-height: ${Math.round(s.h / s.pxRatio)}px) and (-webkit-device-pixel-ratio: ${s.pxRatio}) and (orientation: portrait)`}
          />
        ))}
      </head>
      <body className="antialiased">
        <PWAProvider>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
            <TooltipProvider delay={300}>{children}</TooltipProvider>
            <Toaster position="top-right" richColors closeButton />
          </ThemeProvider>
        </PWAProvider>
      </body>
    </html>
  );
}

"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// ============================================================
// Toasts — one design, on the app's own ground, in both themes
// ============================================================
//
// THE `richColors` TRAP. Read this before adding it back.
//
// `app/layout.tsx` used to mount this as `<Toaster ... richColors />`. That
// prop stamps `data-rich-colors="true"` on every toast, which activates
// Sonner's own rules:
//
//   [data-rich-colors=true][data-sonner-toast][data-type=success] { ... }   (0,3,0)
//
// those outrank the base rule this component was themed through:
//
//   [data-sonner-toast][data-styled=true] { background: var(--normal-bg) }   (0,2,0)
//
// Net effect: the --normal-* vars below applied ONLY to bare `toast()`, while
// `toast.success` / `.error` / `.warning` / `.info` — effectively all 767 call
// sites across 146 files — silently rendered Sonner's stock palette instead.
// Two toast designs shipped side by side and nobody chose that.
//
// Worse, that stock palette is an accessibility defect in the LIGHT theme
// (the app's default), measured with lib/brand/contrast.ts:
//
//   light success #008A2E on #ECFDF3 = 4.26:1   FAIL
//   light info    #0973DC on #F0F8FF = 4.35:1   FAIL
//   light warning #DC7609 on #FFFCF0 = 3.08:1   FAIL
//   light error   #E60000 on #FFF0F0 = 4.35:1   FAIL
//
// (Sonner's dark palette passes; light is the broken one — the same shape as
// the --primary bug the brand work's first commit fixed.)
//
// THE RESOLUTION: drop `richColors`, and let every state render on the app's
// own --popover ground with --popover-foreground text. That is 18.98:1 in
// light and 16.98:1 in dark — AA by construction, and it cannot silently
// regress, because the text pair no longer depends on the state at all.
// State is carried by the icon glyph (check / octagon / triangle / i), which
// is a channel that does not depend on colour at all.

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }

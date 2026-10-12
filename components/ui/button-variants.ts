import { cva, type VariantProps } from "class-variance-authority"

// Not a client module, on purpose: server components call buttonVariants()
// to style a <Link> as a button. Exported from button.tsx ("use client"),
// it became a client reference and threw when a server page called it.

// Design system "Build Alpha Kids": every pressable thing is a pill. The
// filled variants are stickers (2px `ink` outline, hard offset shadow with
// no blur) that press in on hover, translating into a smaller shadow.
// `ghost` and `link` stay flat: they sit in toolbars, menus and table rows,
// where a shadow per control would cost density (owner decision 2026-10-12:
// "branded, dense stays calm").
const STICKER =
  "border-ink shadow-sticker hover:translate-x-px hover:translate-y-px hover:shadow-sticker-xs active:translate-x-[2px] active:translate-y-[2px] active:shadow-none aria-expanded:translate-x-px aria-expanded:translate-y-px aria-expanded:shadow-sticker-xs"

export const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border-2 border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-[transform,box-shadow,background-color,color] duration-150 outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // The call to action: `yellow` (or the portal's accent tint) with ink text.
        default: `${STICKER} bg-cta text-cta-foreground`,
        outline: `${STICKER} bg-white text-ink hover:bg-cream aria-expanded:bg-cream`,
        secondary: `${STICKER} bg-cream text-ink hover:bg-white aria-expanded:bg-white`,
        ghost:
          "text-foreground hover:bg-ink/5 aria-expanded:bg-ink/5",
        // White on `red` is 4.7:1 (AA).
        destructive: `${STICKER} bg-ball-red text-white`,
        // Small orange-toned text on a light ground is `rust` (6.6:1+), never `orange`.
        link: "rounded-none border-0 text-rust underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 px-2.5 text-xs shadow-sticker-xs! hover:shadow-none! has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-3 text-[0.8rem] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-1.5 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-10",
      },
    },
    compoundVariants: [
      // Ghost/link have no sticker shadow to shrink.
      { variant: ["ghost", "link"], size: "xs", className: "shadow-none!" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export type ButtonVariantProps = VariantProps<typeof buttonVariants>

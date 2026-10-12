import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Design system "Build Alpha Kids": tags and chips are pills with an `ink`
// outline. No shadow: badges live in table rows and dense lists, which stay
// calm (owner decision 2026-10-12).
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border-[1.5px] border-transparent px-2 py-0.5 text-xs font-semibold whitespace-nowrap transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "border-ink bg-cta text-cta-foreground [a]:hover:bg-cta/80",
        secondary: "border-ink bg-cream text-ink [a]:hover:bg-white",
        // `red` text on white is 4.7:1.
        destructive: "border-ball-red bg-white text-ball-red [a]:hover:bg-ball-red/5",
        outline: "border-ink bg-white text-ink [a]:hover:bg-cream",
        ghost: "hover:bg-ink/5",
        link: "text-rust underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }

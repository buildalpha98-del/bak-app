import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppLogo } from "@/components/shared/app-logo";

/**
 * Accent = the portal, structure = the brand (Tier-1 owner decision A,
 * 2026-07-16). Staff and parent doors are orange; the client/centre
 * door is teal per the whole-portal convention in CLAUDE.md ("Client
 * portal: teal/blue accent") — do NOT flatten it to orange. Every
 * accented element here is decorative (blurred orbs at ≤8% alpha and a
 * 4px gradient bar carrying no text), so no text-contrast pairing
 * rides on the accent choice; the CTA ink stays #111-on-yellow either
 * way via stickerClasses().
 */
export type AuthAccent = "orange" | "teal";

const ACCENTS: Record<
  AuthAccent,
  { orbs: [string, string, string, string]; bar: string }
> = {
  orange: {
    orbs: [
      "bg-primary/8",
      "bg-[#4CAF50]/6",
      "bg-[#2962FF]/5",
      "bg-[#FFD600]/6",
    ],
    bar: "bg-gradient-to-r from-primary via-[#FFD600] to-[#4CAF50]",
  },
  teal: {
    orbs: ["bg-cyan-600/8", "bg-teal-500/6", "bg-sky-600/5", "bg-cyan-400/6"],
    bar: "bg-gradient-to-r from-cyan-600 via-teal-400 to-cyan-500",
  },
};

interface AuthShellProps {
  title: string;
  description: string;
  accent?: AuthAccent;
  children: React.ReactNode;
}

/**
 * Shared layout shell for ALL auth pages — staff (login, reset, set,
 * update password), parent-login and client-login. One front door,
 * two accents. Field-marking background, floating colour orbs, crest.
 */
export function AuthShell({
  title,
  description,
  accent = "orange",
  children,
}: AuthShellProps) {
  const a = ACCENTS[accent];

  return (
    <main className="flex min-h-screen items-center justify-center auth-field-bg px-4 relative overflow-hidden">
      {/* Decorative blurred orbs — accent-keyed, no text rides on them */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute -top-24 -right-24 h-80 w-80 rounded-full blur-[80px] ${a.orbs[0]}`} />
        <div className={`absolute -bottom-32 -left-24 h-72 w-72 rounded-full blur-[60px] ${a.orbs[1]}`} />
        <div className={`absolute top-1/4 -left-16 h-48 w-48 rounded-full blur-[50px] ${a.orbs[2]}`} />
        <div className={`absolute -bottom-16 right-1/4 h-56 w-56 rounded-full blur-[60px] ${a.orbs[3]}`} />
      </div>

      {/* Diagonal sport stripe overlay */}
      <div className="absolute inset-0 sport-stripe pointer-events-none" />

      <Card className="w-full max-w-md border-0 shadow-2xl shadow-black/8 animate-scale-in relative bg-card/95 backdrop-blur-sm">
        {/* Accent top bar — decorative, 4px, carries no text */}
        <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl ${a.bar}`} />

        <CardHeader className="space-y-4 text-center pb-2 pt-8">
          {/* Logo — larger, with subtle glow */}
          <div className="mx-auto relative">
            <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl scale-150" />
            <AppLogo size="xl" className="relative drop-shadow-lg" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-foreground font-heading tracking-tight">
              {title}
            </CardTitle>
            <CardDescription className="mt-1.5 text-muted-foreground">
              {description}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pb-8">{children}</CardContent>
      </Card>

      {/* Bottom brand text */}
      <p className="absolute bottom-4 text-xs text-muted-foreground/50 tracking-wide">
        Build Alpha Kids &middot; Multi-Sport Coaching
      </p>
    </main>
  );
}

/* eslint-disable @next/next/no-img-element */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AuthShellProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

/**
 * Shared layout shell for all auth pages (login, reset, set, update password).
 * Features field-marking background, floating sports balls, and bold brand presence.
 */
export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <main className="flex min-h-screen items-center justify-center auth-field-bg px-4 relative overflow-hidden">
      {/* Decorative blurred orbs — logo colour extraction */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Orange glow — top right */}
        <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-primary/8 blur-[80px]" />
        {/* Green glow — bottom left (field green from logo) */}
        <div className="absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-[#4CAF50]/6 blur-[60px]" />
        {/* Blue accent — top left */}
        <div className="absolute top-1/4 -left-16 h-48 w-48 rounded-full bg-[#2962FF]/5 blur-[50px]" />
        {/* Yellow pop — bottom right */}
        <div className="absolute -bottom-16 right-1/4 h-56 w-56 rounded-full bg-[#FFD600]/6 blur-[60px]" />
      </div>

      {/* Diagonal sport stripe overlay */}
      <div className="absolute inset-0 sport-stripe pointer-events-none" />

      <Card className="w-full max-w-md border-0 shadow-2xl shadow-black/8 animate-scale-in relative bg-card/95 backdrop-blur-sm">
        {/* Orange top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-[#FFD600] to-[#4CAF50] rounded-t-xl" />

        <CardHeader className="space-y-4 text-center pb-2 pt-8">
          {/* Logo — larger, with subtle glow */}
          <div className="mx-auto relative">
            <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl scale-150" />
            <img
              src="/logo-full.png"
              alt="Build Alpha Kids"
              className="relative h-28 w-auto drop-shadow-lg"
            />
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

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppLogo } from "./app-logo";

interface AuthShellProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

/**
 * Shared layout shell for all auth pages (login, reset, set, update password).
 * Renders the decorative background, logo, card chrome, and title/description.
 */
export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--brand-cream)] px-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <Card className="w-full max-w-md border-0 shadow-xl shadow-black/5 animate-scale-in relative">
        <CardHeader className="space-y-4 text-center pb-2">
          <AppLogo size="lg" className="mx-auto" />
          <div>
            <CardTitle className="text-2xl font-bold text-foreground font-heading">
              {title}
            </CardTitle>
            <CardDescription className="mt-1 text-muted-foreground">
              {description}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}

/**
 * Auth route group layout — one job: pin the front door to the
 * light theme via the `.auth-light-scope` CSS-variable scope in
 * globals.css (see the comment there for the full why). This is a
 * plain wrapper, NOT a next-themes forcedTheme provider: forcedTheme
 * mutates <html>, so signing out would flash the whole document
 * light and back. The scope is local and reversible by deleting
 * this file.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="auth-light-scope">{children}</div>;
}

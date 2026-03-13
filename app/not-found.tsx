import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-sm">
        <div className="text-6xl font-bold text-primary/20 mb-4">404</div>
        <h1 className="text-xl font-bold text-foreground mb-2">
          Page Not Found
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Sorry, the page you&apos;re looking for doesn&apos;t exist or has been
          moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 min-h-[44px]"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}

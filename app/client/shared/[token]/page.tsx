import { getSharedPortalView } from "@/lib/client/actions";
import { SharedPortalView } from "@/components/client/shared-portal-view";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function SharedLinkPage({ params }: Props) {
  const { token } = await params;
  const { data, error } = await getSharedPortalView(token);

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold text-foreground">
            Link Unavailable
          </h1>
          <p className="text-muted-foreground">
            {error ?? "This shared link is invalid or has expired."}
          </p>
          <a
            href="/client-login"
            className="text-cyan-600 hover:underline text-sm"
          >
            Sign in to your portal instead
          </a>
        </div>
      </div>
    );
  }

  return (
    <SharedPortalView
      centreId={data.centreId}
      centreName={data.centreName}
      centreLogoUrl={data.centreLogoUrl}
      primaryUserName={data.primaryUserName}
      snapshot={data.snapshot}
    />
  );
}

import { requireFinancialAccess } from "@/lib/auth/financial-access";

export default async function FinancialSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFinancialAccess();
  return <>{children}</>;
}

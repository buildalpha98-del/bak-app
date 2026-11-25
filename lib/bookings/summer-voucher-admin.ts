import "server-only";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireSummerVoucherAdmin() {
  const session = await createSupabaseServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await session.from("profiles").select("role,status").eq("id", user.id).single();
  if (data?.role !== "admin" || data.status !== "active") notFound();
  return user.id;
}

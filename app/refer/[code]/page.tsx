import Link from "@/components/ui/app-link";
import { getReferralByCode } from "@/lib/referrals/actions";
import { Button } from "@/components/ui/button";
import {
  Trophy,
  Users,
  Star,
  Heart,
  ArrowRight,
} from "lucide-react";

export default async function ReferralLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const result = await getReferralByCode(code);

  if (result.error || !result.data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="rounded-xl bg-card p-8 shadow-lg border border-gray-200">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <span className="text-3xl text-red-400">!</span>
            </div>
            <h1 className="text-xl font-bold text-[#1A1A1A] mb-2">
              Invalid Referral Link
            </h1>
            <p className="text-[#666666] text-sm mb-6">
              This referral link is no longer valid or has expired. Please check
              with the person who shared it with you.
            </p>
            <Link href="/">
              <Button className="bg-primary hover:bg-[#d4651f] text-white min-h-[44px]">
                Visit Build Alpha Kids
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { referrerName } = result.data;

  return (
    <div className="min-h-screen bg-card">
      {/* Hero Header */}
      <div className="bg-primary text-white">
        <div className="max-w-lg mx-auto px-6 py-12 text-center">
          <div className="mb-6">
            <h2 className="text-lg font-semibold tracking-wide uppercase opacity-90">
              Build Alpha Kids
            </h2>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">
            You&apos;ve been invited by {referrerName}!
          </h1>
          <p className="text-white/90 text-lg">
            Join South-West Sydney&apos;s favourite multi-sport programme for
            kids
          </p>
        </div>
      </div>

      {/* Value Proposition */}
      <div className="max-w-lg mx-auto px-6 py-10">
        <h2 className="text-xl font-bold text-[#1A1A1A] mb-6 text-center">
          Why families love Build Alpha Kids
        </h2>

        <div className="space-y-5">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-primary flex-shrink-0">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-[#1A1A1A]">
                19+ Sports to Explore
              </p>
              <p className="text-sm text-[#666666] mt-0.5">
                From soccer and basketball to yoga, dance, and athletics — your
                child discovers what they love
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-primary flex-shrink-0">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-[#1A1A1A]">
                Expert Coaches, Safe Environment
              </p>
              <p className="text-sm text-[#666666] mt-0.5">
                All coaches are WWCC-verified and trained in age-appropriate,
                fun-first coaching methods
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-primary flex-shrink-0">
              <Star className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-[#1A1A1A]">
                Progress Tracking &amp; Skill Reports
              </p>
              <p className="text-sm text-[#666666] mt-0.5">
                Watch your child grow with detailed skill assessments and
                term-by-term progress reports
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-primary flex-shrink-0">
              <Heart className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-[#1A1A1A]">
                Convenient Sessions Near You
              </p>
              <p className="text-sm text-[#666666] mt-0.5">
                Programs run at childcare centres and schools across the
                Bankstown &amp; Liverpool area
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-10 text-center">
          <Link href={`/parent-login?ref=${code}`}>
            <Button className="bg-primary hover:bg-[#d4651f] text-white min-h-[52px] px-8 text-base font-semibold w-full sm:w-auto">
              Sign Up Now
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </Link>
          <p className="text-xs text-[#666666] mt-3">
            Free to join. No commitment required.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 bg-gray-50">
        <div className="max-w-lg mx-auto px-6 py-8 text-center">
          <p className="text-sm font-semibold text-primary">
            Build Alpha Kids
          </p>
          <p className="text-xs text-[#666666] mt-1">
            Multi-sport programs for kids across South-West Sydney
          </p>
          <p className="text-xs text-[#666666] mt-3">
            &copy; {new Date().getFullYear()} Build Alpha Kids. All rights
            reserved.
          </p>
        </div>
      </div>
    </div>
  );
}

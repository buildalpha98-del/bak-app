import { CtaBand } from "@/components/marketing/cta-band";
import { SITE } from "@/lib/marketing/content";

/**
 * The homepage / programs-index B2B call-out — the shared <CtaBand />
 * carrying this page's copy. Labelled, because it renders once per
 * page.
 */
export function B2bBand() {
  return (
    <CtaBand
      label="For schools and childcare centres"
      eyebrow="Schools & centres"
      title="Bring Build Alpha Kids to your school or centre"
      body={
        <>
          Qualified coaches, curriculum-friendly sessions and zero extra admin
          — trusted by schools and centres across {SITE.serviceArea}.
        </>
      }
      href={SITE.enquiryUrl}
      cta="Enquire now"
    />
  );
}

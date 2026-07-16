"use client";

import { useState } from "react";
import { Check, Copy, Code2, BarChart3, Grid3X3, MessageSquareQuote, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getMarketingUrl } from "@/lib/utils/base-url";

// These snippets are for Build Alpha Kids' OWN marketing site — the page
// copy below says "paste into your marketing website", addressed to the
// admin reading it. They were built so the WordPress site could pull live
// data from the app, which is why /api/public/* pins
// Access-Control-Allow-Origin to exactly https://buildalphakids.com.au in
// production. Nothing here targets centre-owned sites; that would require
// CORS to allow arbitrary centre origins.
//
// The origin must therefore be the stable public one. This was
// `window.location.origin` with a dead-domain SSR fallback, which baked
// whatever host the ADMIN happened to be on into the snippet — an admin on
// localhost or a preview URL generated a snippet pointing there.
//
// POST-CUTOVER CLEANUP CANDIDATE (owner's call — do not delete unasked):
// once buildalphakids.com.au IS this app, the marketing pages render stats,
// sports and testimonials natively as server components (lib/marketing/
// stats.ts getImpactStats(), lib/marketing/testimonials.ts
// getApprovedTestimonials(); see Task 2.3) — same-origin, no fetch, no
// CORS. These widgets and the /api/public/{stats,sports,testimonials}
// routes they call become dead weight at that point.
// NOTE: /api/public/refresh-stats is NOT in that set — it is a live cron
// (vercel.json) and must stay regardless.
const APP_URL = getMarketingUrl();

interface Widget {
  name: string;
  description: string;
  icon: React.ReactNode;
  embedCode: string;
  previewHeight: string;
}

const WIDGETS: Widget[] = [
  {
    name: "Stats Bar",
    description:
      "Display live session counts, centre numbers, and average ratings in a compact horizontal bar.",
    icon: <BarChart3 className="h-5 w-5 text-primary" />,
    embedCode: `<div id="bak-stats-bar"></div>
<script>
(function() {
  fetch('${APP_URL}/api/public/stats')
    .then(r => r.json())
    .then(d => {
      const el = document.getElementById('bak-stats-bar');
      if (!el) return;
      el.innerHTML = \`
        <div style="display:flex;gap:2rem;padding:1rem 1.5rem;background:#FFF7ED;border-radius:12px;font-family:system-ui;flex-wrap:wrap;justify-content:center">
          <div style="text-align:center"><div style="font-size:1.5rem;font-weight:700;color:#E8712A">\${d.sessions_all_time?.toLocaleString?.() || 0}</div><div style="font-size:0.75rem;color:#666">Sessions Delivered</div></div>
          <div style="text-align:center"><div style="font-size:1.5rem;font-weight:700;color:#E8712A">\${d.centre_count || 0}+</div><div style="font-size:0.75rem;color:#666">Centres</div></div>
          <div style="text-align:center"><div style="font-size:1.5rem;font-weight:700;color:#E8712A">\${d.sport_count || 0}</div><div style="font-size:0.75rem;color:#666">Sports</div></div>
          <div style="text-align:center"><div style="font-size:1.5rem;font-weight:700;color:#E8712A">\${d.average_rating || 'N/A'}</div><div style="font-size:0.75rem;color:#666">Avg Rating</div></div>
          <div style="text-align:center"><div style="font-size:1.5rem;font-weight:700;color:#E8712A">\${d.children_count?.toLocaleString?.() || 0}+</div><div style="font-size:0.75rem;color:#666">Children</div></div>
        </div>\`;
    });
})();
</script>`,
    previewHeight: "120px",
  },
  {
    name: "Sports Grid",
    description:
      "A responsive grid of all sports offered with descriptions. Great for a services/programs page.",
    icon: <Grid3X3 className="h-5 w-5 text-primary" />,
    embedCode: `<div id="bak-sports-grid"></div>
<script>
(function() {
  fetch('${APP_URL}/api/public/sports')
    .then(r => r.json())
    .then(d => {
      const el = document.getElementById('bak-sports-grid');
      if (!el) return;
      el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1rem;font-family:system-ui">' +
        (d.sports || []).map(s =>
          '<div style="padding:1rem;border:1px solid #eee;border-radius:12px;background:#fff">' +
          '<div style="font-weight:600;color:#1A1A1A;margin-bottom:0.25rem">' + s.name + '</div>' +
          '<div style="font-size:0.8rem;color:#666">' + s.description + '</div></div>'
        ).join('') + '</div>';
    });
})();
</script>`,
    previewHeight: "300px",
  },
  {
    name: "Testimonial Carousel",
    description:
      "Auto-rotating carousel of approved parent and centre testimonials with star ratings.",
    icon: <MessageSquareQuote className="h-5 w-5 text-primary" />,
    embedCode: `<div id="bak-testimonials"></div>
<script>
(function() {
  fetch('${APP_URL}/api/public/testimonials')
    .then(r => r.json())
    .then(d => {
      const el = document.getElementById('bak-testimonials');
      if (!el || !d.testimonials?.length) return;
      let idx = 0;
      const ts = d.testimonials;
      function render() {
        const t = ts[idx];
        const stars = Array(5).fill(0).map((_, i) => '<span style="color:' + (i < t.rating ? '#FBBF24' : '#E5E7EB') + '">&#9733;</span>').join('');
        el.innerHTML = '<div style="max-width:600px;margin:0 auto;padding:2rem;text-align:center;font-family:system-ui">' +
          '<div style="font-size:1.25rem;margin-bottom:0.5rem">' + stars + '</div>' +
          '<p style="font-size:1rem;color:#1A1A1A;font-style:italic;margin-bottom:1rem">"' + t.comment + '"</p>' +
          '<p style="font-size:0.875rem;font-weight:600;color:#E8712A">' + t.display_name + '</p>' +
          '<p style="font-size:0.75rem;color:#666">' + t.centre_name + '</p></div>';
      }
      render();
      setInterval(() => { idx = (idx + 1) % ts.length; render(); }, 5000);
    });
})();
</script>`,
    previewHeight: "200px",
  },
  {
    name: "Enquiry Form",
    description:
      "Contact form that submits directly into the CRM pipeline as a new lead. Includes centre name, contact details, and message.",
    icon: <FileText className="h-5 w-5 text-primary" />,
    embedCode: `<div id="bak-enquiry-form"></div>
<script>
(function() {
  const el = document.getElementById('bak-enquiry-form');
  if (!el) return;
  el.innerHTML = \`
    <form id="bak-form" style="max-width:500px;font-family:system-ui;display:flex;flex-direction:column;gap:0.75rem">
      <h3 style="font-size:1.25rem;font-weight:700;color:#1A1A1A;margin:0">Get in Touch</h3>
      <input name="centre_name" placeholder="Centre / School Name *" required style="padding:0.6rem 0.75rem;border:1px solid #ddd;border-radius:8px;font-size:0.875rem" />
      <input name="contact_name" placeholder="Your Name" style="padding:0.6rem 0.75rem;border:1px solid #ddd;border-radius:8px;font-size:0.875rem" />
      <input name="contact_email" type="email" placeholder="Email *" required style="padding:0.6rem 0.75rem;border:1px solid #ddd;border-radius:8px;font-size:0.875rem" />
      <input name="contact_phone" type="tel" placeholder="Phone" style="padding:0.6rem 0.75rem;border:1px solid #ddd;border-radius:8px;font-size:0.875rem" />
      <select name="type" style="padding:0.6rem 0.75rem;border:1px solid #ddd;border-radius:8px;font-size:0.875rem">
        <option value="childcare">Childcare Centre</option>
        <option value="school">School</option>
      </select>
      <textarea name="message" placeholder="Message" rows="3" style="padding:0.6rem 0.75rem;border:1px solid #ddd;border-radius:8px;font-size:0.875rem;resize:vertical"></textarea>
      <button type="submit" style="background:#E8712A;color:#fff;border:none;padding:0.7rem;border-radius:8px;font-size:0.875rem;font-weight:600;cursor:pointer">Submit Enquiry</button>
      <div id="bak-form-msg" style="font-size:0.8rem;text-align:center"></div>
    </form>\`;
  document.getElementById('bak-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = document.getElementById('bak-form-msg');
    msg.textContent = 'Sending...';
    fetch('${APP_URL}/api/crm/enquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(fd))
    }).then(r => r.json()).then(d => {
      msg.style.color = d.success ? '#16A34A' : '#DC2626';
      msg.textContent = d.success ? 'Thank you! We will be in touch.' : (d.error || 'Something went wrong.');
      if (d.success) e.target.reset();
    }).catch(() => { msg.style.color = '#DC2626'; msg.textContent = 'Network error. Please try again.'; });
  });
})();
</script>`,
    previewHeight: "400px",
  },
];

export default function WidgetsPage() {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  function copyToClipboard(code: string, idx: number) {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1A1A1A]">
          Embeddable Widgets
        </h1>
        <p className="text-sm text-[#666666]">
          Copy and paste these code snippets into your marketing website to
          display live data from Build Alpha Kids.
        </p>
      </div>

      <div className="space-y-8">
        {WIDGETS.map((widget, idx) => (
          <div
            key={widget.name}
            className="rounded-xl border bg-card overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50">
                  {widget.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-[#1A1A1A]">
                    {widget.name}
                  </h3>
                  <p className="text-sm text-[#666666]">
                    {widget.description}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => copyToClipboard(widget.embedCode, idx)}
              >
                {copiedIdx === idx ? (
                  <>
                    <Check className="h-4 w-4 text-green-600" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy Embed Code
                  </>
                )}
              </Button>
            </div>

            {/* Preview */}
            <div className="border-b bg-[#F5F5F5] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="text-xs">
                  Live Preview
                </Badge>
              </div>
              <div
                className="rounded-lg border bg-card overflow-hidden"
                style={{ minHeight: widget.previewHeight }}
              >
                <iframe
                  srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:1rem;font-family:system-ui,-apple-system,sans-serif;}</style></head><body>${widget.embedCode}</body></html>`}
                  className="w-full border-0"
                  style={{ height: widget.previewHeight }}
                  sandbox="allow-scripts"
                  title={`${widget.name} preview`}
                />
              </div>
            </div>

            {/* Code */}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Code2 className="h-4 w-4 text-[#666666]" />
                <span className="text-xs font-medium text-[#666666]">
                  Embed Code
                </span>
              </div>
              <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-300">
                <code>{widget.embedCode}</code>
              </pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

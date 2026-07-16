"use client";

import { useState, useRef } from "react";
import Link from "@/components/ui/app-link";
import { ArrowLeft, Copy, CheckCircle, Code, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getMarketingUrl } from "@/lib/utils/base-url";

// ============================================================
// Embeddable HTML snippet
// ============================================================

const EMBED_SNIPPET = `<!-- Build Alpha Kids Enquiry Form -->
<div id="bak-enquiry-form" style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <form id="bak-form" style="background:#fff;border:2px solid #E8712A;border-radius:12px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <div style="text-align:center;margin-bottom:20px">
      <h2 style="margin:0 0 4px;color:#1A1A1A;font-size:22px;font-weight:700">Book a Free Trial Session</h2>
      <p style="margin:0;color:#666;font-size:14px">Fill in the details below and we&#39;ll be in touch</p>
    </div>
    <div style="margin-bottom:14px">
      <label style="display:block;margin-bottom:4px;font-size:13px;font-weight:600;color:#1A1A1A">Centre / School Name *</label>
      <input name="centre_name" required placeholder="e.g. Little Stars Childcare" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;outline:none" onfocus="this.style.borderColor='#E8712A'" onblur="this.style.borderColor='#ddd'" />
    </div>
    <div style="margin-bottom:14px">
      <label style="display:block;margin-bottom:4px;font-size:13px;font-weight:600;color:#1A1A1A">Type *</label>
      <select name="type" required style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;background:#fff;outline:none" onfocus="this.style.borderColor='#E8712A'" onblur="this.style.borderColor='#ddd'">
        <option value="">Select type...</option>
        <option value="childcare_centre">Childcare Centre</option>
        <option value="school">School</option>
      </select>
    </div>
    <div style="margin-bottom:14px">
      <label style="display:block;margin-bottom:4px;font-size:13px;font-weight:600;color:#1A1A1A">Your Name *</label>
      <input name="contact_name" required placeholder="Full name" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;outline:none" onfocus="this.style.borderColor='#E8712A'" onblur="this.style.borderColor='#ddd'" />
    </div>
    <div style="margin-bottom:14px">
      <label style="display:block;margin-bottom:4px;font-size:13px;font-weight:600;color:#1A1A1A">Email *</label>
      <input name="contact_email" type="email" required placeholder="you@example.com" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;outline:none" onfocus="this.style.borderColor='#E8712A'" onblur="this.style.borderColor='#ddd'" />
    </div>
    <div style="margin-bottom:14px">
      <label style="display:block;margin-bottom:4px;font-size:13px;font-weight:600;color:#1A1A1A">Phone</label>
      <input name="contact_phone" type="tel" placeholder="04XX XXX XXX" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;outline:none" onfocus="this.style.borderColor='#E8712A'" onblur="this.style.borderColor='#ddd'" />
    </div>
    <div style="margin-bottom:20px">
      <label style="display:block;margin-bottom:4px;font-size:13px;font-weight:600;color:#1A1A1A">Message</label>
      <textarea name="message" rows="3" placeholder="Tell us about your needs..." style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;resize:vertical;outline:none" onfocus="this.style.borderColor='#E8712A'" onblur="this.style.borderColor='#ddd'"></textarea>
    </div>
    <button type="submit" style="width:100%;padding:12px;background:#E8712A;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;transition:background 0.2s" onmouseover="this.style.background='#d4631f'" onmouseout="this.style.background='#E8712A'">Send Enquiry</button>
    <div id="bak-form-message" style="margin-top:12px;text-align:center;font-size:13px;display:none"></div>
  </form>
</div>
<script>
(function(){
  var form=document.getElementById('bak-form');
  var msg=document.getElementById('bak-form-message');
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var btn=form.querySelector('button[type=submit]');
    btn.disabled=true;btn.textContent='Sending...';
    msg.style.display='none';
    var fd=new FormData(form);
    var body={};fd.forEach(function(v,k){body[k]=v;});
    fetch('YOUR_APP_URL/api/crm/enquiry',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    }).then(function(r){return r.json();}).then(function(data){
      if(data.error){throw new Error(data.error);}
      msg.style.color='#16a34a';
      msg.textContent='Thanks! We\\'ll be in touch shortly.';
      msg.style.display='block';
      form.reset();
    }).catch(function(err){
      msg.style.color='#dc2626';
      msg.textContent='Something went wrong. Please try again.';
      msg.style.display='block';
    }).finally(function(){
      btn.disabled=false;btn.textContent='Send Enquiry';
    });
  });
})();
</script>`;

// ============================================================
// Component
// ============================================================

export function EmbedFormView() {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLPreElement>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(EMBED_SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      if (codeRef.current) {
        const range = document.createRange();
        range.selectNodeContents(codeRef.current);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          render={<Link href="/admin/crm" />}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Website Enquiry Form
          </h1>
          <p className="text-sm text-muted-foreground">
            Copy this HTML snippet and paste it into your website
            (buildalphakids.com.au) to receive enquiries directly into the CRM.
          </p>
        </div>
      </div>

      <Tabs defaultValue="code">
        <TabsList>
          <TabsTrigger value="code">
            <Code className="mr-1.5 size-3.5" />
            Code
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye className="mr-1.5 size-3.5" />
            Preview
          </TabsTrigger>
        </TabsList>

        {/* Code tab */}
        <TabsContent value="code" className="space-y-3">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-xs">
              HTML + JavaScript
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <CheckCircle className="size-3.5 text-emerald-600" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  Copy to Clipboard
                </>
              )}
            </Button>
          </div>

          <Card className="overflow-hidden">
            <pre
              ref={codeRef}
              className="overflow-x-auto p-4 text-xs leading-relaxed text-muted-foreground"
            >
              <code>{EMBED_SNIPPET}</code>
            </pre>
          </Card>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <strong>Note:</strong> Replace{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">
              YOUR_APP_URL
            </code>{" "}
            with your actual application URL (e.g.{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">
              {getMarketingUrl()}
            </code>
            ).
          </div>
        </TabsContent>

        {/* Preview tab */}
        <TabsContent value="preview">
          <Card className="p-6">
            <div className="mx-auto max-w-[480px]">
              <form
                onSubmit={(e) => e.preventDefault()}
                className="space-y-3.5 rounded-xl border-2 border-primary bg-card p-7 shadow-sm"
              >
                <div className="text-center">
                  <h2 className="text-[22px] font-bold text-[#1A1A1A]">
                    Book a Free Trial Session
                  </h2>
                  <p className="mt-1 text-sm text-[#666]">
                    Fill in the details below and we&apos;ll be in touch
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-[13px] font-semibold text-[#1A1A1A]">
                    Centre / School Name *
                  </label>
                  <input
                    placeholder="e.g. Little Stars Childcare"
                    className="w-full rounded-lg border border-[#ddd] px-3 py-2.5 text-sm outline-none focus:border-primary"
                    readOnly
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[13px] font-semibold text-[#1A1A1A]">
                    Type *
                  </label>
                  <select
                    className="w-full rounded-lg border border-[#ddd] bg-card px-3 py-2.5 text-sm outline-none focus:border-primary"
                    disabled
                  >
                    <option>Select type...</option>
                    <option>Childcare Centre</option>
                    <option>School</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[13px] font-semibold text-[#1A1A1A]">
                    Your Name *
                  </label>
                  <input
                    placeholder="Full name"
                    className="w-full rounded-lg border border-[#ddd] px-3 py-2.5 text-sm outline-none focus:border-primary"
                    readOnly
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[13px] font-semibold text-[#1A1A1A]">
                    Email *
                  </label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-[#ddd] px-3 py-2.5 text-sm outline-none focus:border-primary"
                    readOnly
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[13px] font-semibold text-[#1A1A1A]">
                    Phone
                  </label>
                  <input
                    type="tel"
                    placeholder="04XX XXX XXX"
                    className="w-full rounded-lg border border-[#ddd] px-3 py-2.5 text-sm outline-none focus:border-primary"
                    readOnly
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[13px] font-semibold text-[#1A1A1A]">
                    Message
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Tell us about your needs..."
                    className="w-full resize-y rounded-lg border border-[#ddd] px-3 py-2.5 text-sm outline-none focus:border-primary"
                    readOnly
                  />
                </div>

                <button
                  type="button"
                  className="w-full rounded-lg bg-primary px-4 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-[#d4631f]"
                >
                  Send Enquiry
                </button>
              </form>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

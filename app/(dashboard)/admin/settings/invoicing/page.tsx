"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import {
  type BusinessSettingsMap,
  getBusinessSettings,
  updateBusinessSettings,
} from "@/lib/invoicing/business-settings-actions";

const EMPTY_SETTINGS: BusinessSettingsMap = {
  business_name: "",
  abn: "",
  business_address: "",
  business_phone: "",
  business_email: "",
  bank_name: "",
  bank_bsb: "",
  bank_account_number: "",
  bank_account_name: "",
  payment_terms_text: "Payment due within 14 days of invoice date.",
  payment_terms_days: 14,
  gst_enabled: true,
  gst_inclusive: false,
  gst_rate: 10,
  square_online_enabled: false,
  square_payment_url: "",
};

export default function InvoicingSettingsPage() {
  const [settings, setSettings] = useState<BusinessSettingsMap>(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data, error } = await getBusinessSettings();
      if (error) {
        toast.error("Failed to load settings: " + error);
      } else if (data) {
        setSettings(data);
      }
      setLoading(false);
    }
    load();
  }, []);

  function updateField<K extends keyof BusinessSettingsMap>(
    key: K,
    value: BusinessSettingsMap[K]
  ) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const { error } = await updateBusinessSettings(settings);
    if (error) {
      toast.error("Failed to save settings: " + error);
    } else {
      toast.success("Invoicing settings saved successfully.");
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">
          Invoicing Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage business details, bank account information, and payment terms
          used on all outbound invoices.
        </p>
      </div>

      {/* Business Details */}
      <Card>
        <CardHeader>
          <CardTitle>Business Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="business_name">Business Name</Label>
            <Input
              id="business_name"
              value={settings.business_name}
              onChange={(e) => updateField("business_name", e.target.value)}
              placeholder="Build Alpha Kids Pty Ltd"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="abn">ABN</Label>
            <Input
              id="abn"
              value={settings.abn}
              onChange={(e) => updateField("abn", e.target.value)}
              placeholder="12 345 678 901"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="business_address">Business Address</Label>
            <Input
              id="business_address"
              value={settings.business_address}
              onChange={(e) => updateField("business_address", e.target.value)}
              placeholder="123 Main Street, Sydney NSW 2000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="business_phone">Phone</Label>
            <Input
              id="business_phone"
              type="tel"
              value={settings.business_phone}
              onChange={(e) => updateField("business_phone", e.target.value)}
              placeholder="0412 345 678"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="business_email">Email</Label>
            <Input
              id="business_email"
              type="email"
              value={settings.business_email}
              onChange={(e) => updateField("business_email", e.target.value)}
              placeholder="accounts@buildalphakids.com.au"
            />
          </div>
        </CardContent>
      </Card>

      {/* Bank Account Details */}
      <Card>
        <CardHeader>
          <CardTitle>Bank Account Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bank_name">Bank Name</Label>
            <Input
              id="bank_name"
              value={settings.bank_name}
              onChange={(e) => updateField("bank_name", e.target.value)}
              placeholder="Commonwealth Bank"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank_account_name">Account Name</Label>
            <Input
              id="bank_account_name"
              value={settings.bank_account_name}
              onChange={(e) => updateField("bank_account_name", e.target.value)}
              placeholder="Build Alpha Kids Pty Ltd"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank_bsb">BSB</Label>
            <Input
              id="bank_bsb"
              value={settings.bank_bsb}
              onChange={(e) => updateField("bank_bsb", e.target.value)}
              placeholder="062-000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank_account_number">Account Number</Label>
            <Input
              id="bank_account_number"
              value={settings.bank_account_number}
              onChange={(e) =>
                updateField("bank_account_number", e.target.value)
              }
              placeholder="1234 5678"
            />
          </div>
        </CardContent>
      </Card>

      {/* Payment Terms */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Terms</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="payment_terms_text">Payment Terms Text</Label>
            <Input
              id="payment_terms_text"
              value={settings.payment_terms_text}
              onChange={(e) =>
                updateField("payment_terms_text", e.target.value)
              }
              placeholder="Payment due within 14 days of invoice date."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment_terms_days">Payment Terms (Days)</Label>
            <Input
              id="payment_terms_days"
              type="number"
              min={0}
              value={settings.payment_terms_days}
              onChange={(e) =>
                updateField("payment_terms_days", Number(e.target.value))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* GST Settings */}
      <Card>
        <CardHeader>
          <CardTitle>GST Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.gst_enabled}
              onChange={(e) => updateField("gst_enabled", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="text-sm font-medium">GST Registered</span>
          </label>

          {settings.gst_enabled && (
            <>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.gst_inclusive}
                  onChange={(e) =>
                    updateField("gst_inclusive", e.target.checked)
                  }
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="text-sm font-medium">
                  Prices are GST Inclusive
                </span>
              </label>

              <div className="max-w-xs space-y-2">
                <Label htmlFor="gst_rate">GST Rate (%)</Label>
                <Input
                  id="gst_rate"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={settings.gst_rate}
                  onChange={(e) =>
                    updateField("gst_rate", Number(e.target.value))
                  }
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Online Payments */}
      <Card>
        <CardHeader>
          <CardTitle>Online Payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.square_online_enabled}
              onChange={(e) =>
                updateField("square_online_enabled", e.target.checked)
              }
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="text-sm font-medium">
              Enable Square Online Payments
            </span>
          </label>

          {settings.square_online_enabled && (
            <div className="space-y-2">
              <Label htmlFor="square_payment_url">Square Payment URL</Label>
              <Input
                id="square_payment_url"
                type="url"
                value={settings.square_payment_url}
                onChange={(e) =>
                  updateField("square_payment_url", e.target.value)
                }
                placeholder="https://squareup.com/pay/..."
              />
              <p className="text-xs text-muted-foreground">
                This link will be included on invoices so clients can pay online.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-[#d4651f] text-white"
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Settings
        </Button>
      </div>
    </div>
  );
}

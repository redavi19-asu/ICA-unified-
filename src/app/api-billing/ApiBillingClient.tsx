"use client";
import { useEffect, useState } from "react";
type Plan = {
  mode: string;
  entitled: boolean;
  subscriptionStatus: string;
  monthlyAmountCents: number | null;
  periodEnd: number;
  used: number;
  allowance: number | null;
  pricing: { ready: boolean; amount: number | null; allowance: number | null };
};
export default function ApiBillingClient({ company }: { company: string }) {
  const [plan, setPlan] = useState<Plan | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  async function refresh() {
    const response = await fetch("/api/integrations/api-plan", {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Unable to read API billing.");
    setPlan(data);
  }
  useEffect(() => {
    void refresh().catch((error) => setMessage(error.message));
  }, []);
  async function act(cancel = false) {
    setBusy(true);
    try {
      const response = await fetch("/api/integrations/api-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          cancel
            ? { action: "CANCEL_API_RENEWAL", confirmation: "CANCEL API" }
            : { action: "CHECKOUT" },
        ),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to manage API billing.");
      if (data.checkoutUrl) window.location.assign(data.checkoutUrl);
      else
        setMessage(
          `API renewal cancelled; access ends ${new Date(data.endsAt).toLocaleDateString()}. Software billing is unchanged.`,
        );
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to manage API billing.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      style={{
        maxWidth: 800,
        margin: "auto",
        padding: "48px 24px",
        lineHeight: 1.7,
      }}
    >
      <a href="/workspace/integrations">← Integrations</a>
      <h1>Separate API billing</h1>
      <p>
        {company}. Your software subscription and API subscription are separate.
        You can manage or cancel API renewal here even when software access
        needs renewal.
      </p>
      {plan && (
        <section>
          <p>Status: {plan.subscriptionStatus.replaceAll("_", " ")}.</p>
          {plan.mode === "PREPARATION" && !plan.entitled && (
            <p>
              Separate API billing is being prepared. No API fee is active yet.
            </p>
          )}
          <p>
            {plan.used.toLocaleString()} requests across company keys
            {plan.allowance !== null
              ? ` / ${plan.allowance.toLocaleString()} included`
              : ""}
            . Period ends {new Date(plan.periodEnd).toLocaleDateString()}.
          </p>
          {plan.entitled && plan.monthlyAmountCents && (
            <p>
              Current API subscription: $
              {(plan.monthlyAmountCents / 100).toFixed(2)}/month.
            </p>
          )}
          {!plan.entitled && plan.pricing.ready && (
            <p>
              API plan: ${((plan.pricing.amount || 0) / 100).toFixed(2)}/month
              for {plan.pricing.allowance?.toLocaleString()} requests. Active
              software access is also required.
            </p>
          )}
          <button
            disabled={busy || !plan.pricing.ready || plan.entitled}
            onClick={() => void act()}
          >
            Start API subscription
          </button>
          {plan.entitled && (
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />{" "}
                Cancel only API renewal; software billing continues.
              </label>
              <p>
                <button
                  disabled={busy || !confirmed}
                  onClick={() => void act(true)}
                >
                  Cancel API renewal
                </button>
              </p>
            </div>
          )}
          <p>
            No automatic overage charges are enabled. Your allowance is shared
            across all keys; extra keys do not add allowance. Checkout redirects
            do not grant access—verified subscription status does.
          </p>
        </section>
      )}
      {message && <p role="status">{message}</p>}
      <a href="/setup/billing">Manage software billing →</a>
    </main>
  );
}

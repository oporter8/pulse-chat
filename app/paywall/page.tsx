"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AccessState = {
  hasAccess: boolean;
  accessType: "admin" | "paid" | "comped" | null;
};

type PayPalSdk = {
  FUNDING: { PAYPAL: unknown; VENMO: unknown };
  Buttons: (options: Record<string, unknown>) => {
    isEligible: () => boolean;
    render: (selector: string) => Promise<void>;
  };
};

async function authFetch(url: string, options?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired. Log in again.");
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}

export default function PaywallPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [cashAppWorking, setCashAppWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [paypalReady, setPaypalReady] = useState(false);
  const [venmoEligible, setVenmoEligible] = useState(true);

  const checkAccess = useCallback(async () => {
    setChecking(true);
    setMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/");
        return;
      }
      setEmail(data.session.user.email ?? "");

      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get("session_id");
      if (params.get("cashapp_success") === "1" && sessionId) {
        setMessage("Confirming your Cash App payment…");
        await authFetch("/api/billing/verify", {
          method: "POST",
          body: JSON.stringify({ sessionId }),
        });
      }

      const access = await authFetch("/api/billing/access") as AccessState;
      if (access.hasAccess) {
        router.replace("/chat");
        return;
      }

      if (params.get("canceled") === "1") setMessage("Payment was canceled. You were not charged.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not check your access.");
    } finally {
      setChecking(false);
    }
  }, [router]);

  useEffect(() => {
    void checkAccess();
  }, [checkAccess]);

  useEffect(() => {
    let cancelled = false;

    async function setupPayPal() {
      try {
        const configResponse = await fetch("/api/billing/paypal/config", { cache: "no-store" });
        const config = await configResponse.json().catch(() => ({})) as { clientId?: string; env?: "sandbox" | "live"; error?: string };
        if (!configResponse.ok || !config.clientId) throw new Error(config.error || "PayPal is not configured.");
        if (cancelled) return;

        const existing = document.querySelector<HTMLScriptElement>('script[data-tiger-paypal="1"]');
        if (existing) existing.remove();

        const script = document.createElement("script");
        const sandboxBuyer = config.env === "sandbox" ? "&buyer-country=US" : "";
        script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(config.clientId)}&currency=USD&intent=capture&enable-funding=venmo&disable-funding=card,credit,paylater${sandboxBuyer}`;
        script.async = true;
        script.dataset.tigerPaypal = "1";
        script.onload = async () => {
          if (cancelled) return;
          const paypal = (window as Window & { paypal?: PayPalSdk }).paypal;
          if (!paypal) throw new Error("PayPal checkout did not load.");

          const createOrder = async () => {
            const result = await authFetch("/api/billing/paypal/create-order", { method: "POST" }) as { orderId?: string; alreadyHasAccess?: boolean };
            if (result.alreadyHasAccess) {
              router.replace("/chat");
              throw new Error("Access already active.");
            }
            if (!result.orderId) throw new Error("PayPal order ID was missing.");
            return result.orderId;
          };

          const onApprove = async (data: { orderID?: string }) => {
            if (!data.orderID) throw new Error("PayPal approval was missing an order ID.");
            setMessage("Confirming payment…");
            await authFetch("/api/billing/paypal/capture-order", {
              method: "POST",
              body: JSON.stringify({ orderId: data.orderID }),
            });
            await checkAccess();
          };

          const onError = (error: unknown) => {
            console.error("PayPal/Venmo checkout error:", error);
            setMessage(error instanceof Error ? error.message : "Payment could not be completed.");
          };

          const paypalButton = paypal.Buttons({
            fundingSource: paypal.FUNDING.PAYPAL,
            style: { layout: "vertical", shape: "rect", label: "paypal", height: 46 },
            createOrder,
            onApprove,
            onError,
          });
          if (paypalButton.isEligible()) await paypalButton.render("#tiger-paypal-button");

          const venmoButton = paypal.Buttons({
            fundingSource: paypal.FUNDING.VENMO,
            style: { layout: "vertical", shape: "rect", height: 46 },
            createOrder,
            onApprove,
            onError,
          });
          const venmoOk = venmoButton.isEligible();
          setVenmoEligible(venmoOk);
          if (venmoOk) await venmoButton.render("#tiger-venmo-button");
          setPaypalReady(true);
        };
        script.onerror = () => {
          if (!cancelled) setMessage("Could not load PayPal/Venmo checkout.");
        };
        document.head.appendChild(script);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Could not load wallet checkout.");
      }
    }

    void setupPayPal();
    return () => {
      cancelled = true;
    };
  }, [checkAccess, router]);

  async function startCashApp() {
    setCashAppWorking(true);
    setMessage("");
    try {
      const body = await authFetch("/api/billing/checkout", { method: "POST" });
      if (body.alreadyHasAccess) {
        router.replace("/chat");
        return;
      }
      if (typeof body.url !== "string") throw new Error("Cash App checkout URL was missing.");
      window.location.assign(body.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start Cash App checkout.");
      setCashAppWorking(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut({ scope: "local" });
    router.replace("/");
  }

  return (
    <main className="paywall-shell-v9">
      <section className="paywall-card-v9">
        <div className="brand-lockup">
          <div className="brand-mark">T</div>
          <div>
            <h1>Tiger Chat</h1>
            <p>Private messaging for the FHS community.</p>
          </div>
        </div>

        <div className="paywall-price-v9">
          <span className="paywall-eyebrow-v9">One-time access</span>
          <div><strong>$3</strong><span>USD</span></div>
          <p>Pay once and keep access to Tiger Chat. This is not a subscription.</p>
        </div>

        <div className="paywall-feature-list-v9">
          <span>✓ Direct and group messaging</span>
          <span>✓ Photos, files, reactions, search, and notifications</span>
          <span>✓ Your existing account and conversations stay with you</span>
        </div>

        {email && <p className="paywall-account-v9">Signed in as <strong>{email}</strong></p>}
        {message && <p className="form-message" aria-live="polite">{message}</p>}

        <div className="wallet-stack-v91">
          <button type="button" className="cashapp-button-v91" disabled={checking || cashAppWorking} onClick={() => void startCashApp()}>
            {cashAppWorking ? "Opening Cash App…" : "Pay $3 with Cash App"}
          </button>

          <div className="wallet-divider-v91"><span>or</span></div>

          <div id="tiger-paypal-button" className="wallet-provider-slot-v91" aria-label="Pay with PayPal" />
          <div id="tiger-venmo-button" className="wallet-provider-slot-v91" aria-label="Pay with Venmo" />

          {!paypalReady && <div className="wallet-loading-v91">Loading PayPal and Venmo…</div>}
          {paypalReady && !venmoEligible && (
            <p className="wallet-help-v91">Venmo is not eligible on this browser/device. Open Tiger Chat on a US mobile browser with Venmo available.</p>
          )}
        </div>

        <button type="button" className="secondary-button" disabled={checking || cashAppWorking} onClick={() => void checkAccess()}>
          I was given free access — check again
        </button>

        <p className="paywall-stripe-note-v9">Tiger Chat offers Cash App Pay, Venmo, and PayPal only. No card-number form is shown on Tiger Chat.</p>
        <button type="button" className="text-button paywall-signout-v9" onClick={() => void signOut()}>Sign out</button>
      </section>
    </main>
  );
}

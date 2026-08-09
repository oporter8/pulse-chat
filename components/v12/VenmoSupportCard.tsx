"use client";

import { useMemo, useState } from "react";
import QRCode from "qrcode";

type Props = {
  url: string;
  label?: string;
};

export function VenmoSupportCard({ url, label = "Venmo" }: Props) {
  const [copied, setCopied] = useState(false);
  const matrix = useMemo(() => {
    if (!url) return null;
    try {
      const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
      const size = qr.modules.size;
      const raw = qr.modules.data as unknown as ArrayLike<number>;
      const data = Array.from(raw, (value) => Boolean(value));
      return { size, data };
    } catch {
      return null;
    }
  }, [url]);

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (!url) {
    return <section className="v12-venmo-card disabled">
      <div><p className="v12-kicker">Venmo support</p><h2>QR code not configured</h2><p>Add a compliant Venmo profile URL to <code>NEXT_PUBLIC_VENMO_PROFILE_URL</code>.</p></div>
    </section>;
  }

  return <section className="v12-venmo-card">
    <div className="v12-venmo-copy">
      <p className="v12-kicker">Optional support</p>
      <h2>Support with {label}</h2>
      <p>Scan the code with Venmo or your phone camera. Tiger Chat stays free whether you contribute or not.</p>
      <div className="v12-action-row">
        <a className="primary-button" href={url} target="_blank" rel="noreferrer">Open Venmo</a>
        <button className="secondary-button" onClick={() => void copyLink()}>{copied ? "Copied" : "Copy link"}</button>
      </div>
      <small>Supporter status is granted manually after a contribution is verified.</small>
    </div>
    {matrix && <div className="v12-qr-shell" aria-label={`QR code for ${label}`}>
      <div className="v12-qr" style={{ gridTemplateColumns: `repeat(${matrix.size}, 1fr)` }}>
        {matrix.data.map((filled, index) => <span key={index} className={filled ? "filled" : ""} />)}
      </div>
      <strong>{label}</strong>
    </div>}
  </section>;
}

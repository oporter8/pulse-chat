"use client";

import { FormEvent, useEffect, useState } from "react";

type ReportReason = "spam" | "harassment" | "impersonation" | "inappropriate" | "other";

type ReportModalProps = {
  open: boolean;
  targetLabel: string;
  onClose: () => void;
  onSubmit: (reason: ReportReason, details: string) => Promise<void>;
};

export function ReportModal({ open, targetLabel, onClose, onSubmit }: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason("spam");
    setDetails("");
  }, [open]);

  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(reason, details.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className="modal-card compact-modal" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <div className="modal-heading">
          <div>
            <h2 id="report-title">Report</h2>
            <p>Report {targetLabel} for review.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close report">×</button>
        </div>

        <form className="stack-form" onSubmit={submit}>
          <label>
            Reason
            <select value={reason} onChange={(event) => setReason(event.target.value as ReportReason)}>
              <option value="spam">Spam</option>
              <option value="harassment">Harassment or bullying</option>
              <option value="impersonation">Impersonation</option>
              <option value="inappropriate">Inappropriate content</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label>
            Details (optional)
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="Add useful context for the moderator."
            />
          </label>

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="danger-button" disabled={saving}>
              {saving ? "Submitting…" : "Submit report"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

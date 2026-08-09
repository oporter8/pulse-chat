"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Report } from "@/lib/chat-types";
import { formatDateTime } from "@/lib/chat-utils";

export function ReportHistory({ open }: { open: boolean }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function loadReports() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("reports")
          .select("id,reporter_id,reported_user_id,message_id,reason,details,status,created_at,reviewed_at,reviewed_by")
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;
        if (!cancelled) setReports((data ?? []) as Report[]);
      } catch (error) {
        console.error("Could not load report history:", error);
        if (!cancelled) setReports([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadReports();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div>
      <h3>Your reports</h3>
      <p className="muted-copy">Reports you submitted and their review status.</p>
      {loading ? <div className="mini-skeleton-list-v8"><span /><span /><span /></div> : reports.length === 0 ? (
        <div className="empty-card">You have not submitted any reports.</div>
      ) : (
        <div className="report-history-v8">
          {reports.map((report) => (
            <article key={report.id}>
              <span><strong>{report.reason}</strong><small>{formatDateTime(report.created_at)}</small></span>
              <span className={`report-status-v8 status-${report.status}`}>{report.status}</span>
              {report.details && <p>{report.details}</p>}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

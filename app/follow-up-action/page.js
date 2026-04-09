"use client";

import Link from "next/link";
import { toPng } from "html-to-image";
import { useEffect, useMemo, useRef, useState } from "react";

const MATCHED_ROWS_STORAGE_KEY = "sampark_weekly_followup_rows_v1";

function cleanMobile(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export default function FollowUpActionPage() {
  const exportRef = useRef(null);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MATCHED_ROWS_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      setRows(parsed);
    } catch {
      setRows([]);
    }
  }, []);

  const actionRows = useMemo(() => {
    return [...rows]
      .map((row) => ({
        memberName: String(row.memberName ?? "").trim(),
        followup: String(row.followup ?? "Unassigned").trim() || "Unassigned",
        mobile: cleanMobile(row.mobile),
        absentCount: Number(row.absentCount) || 0,
      }))
      .filter((row) => row.memberName)
      .sort((a, b) => {
        const followOrder = a.followup.localeCompare(b.followup);
        if (followOrder !== 0) return followOrder;
        return b.absentCount - a.absentCount;
      });
  }, [rows]);

  const exportImage = async () => {
    if (!exportRef.current) return;

    const dataUrl = await toPng(exportRef.current, {
      cacheBust: true,
      pixelRatio: Math.max(window.devicePixelRatio || 1, 2),
      backgroundColor: "#ffffff",
    });

    const link = document.createElement("a");
    link.download = "follow-up-action-list.png";
    link.href = dataUrl;
    link.click();
  };

  return (
    <main className="min-h-screen bg-linear-to-br from-slate-100 via-blue-50 to-indigo-100 px-4 py-6 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/70">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h1 className="text-sm font-bold text-slate-900 sm:text-base">Follow-up Action Page</h1>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-900"
            >
              Back to Dashboard
            </Link>
            <button
              type="button"
              onClick={exportImage}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
            >
              Export as Image
            </button>
          </div>
        </div>

        {!actionRows.length && (
          <div className="px-4 py-10 text-center text-sm text-slate-600">
            No follow-up rows found. Upload Master and Weekly CSV on dashboard first.
          </div>
        )}

        {!!actionRows.length && (
          <div className="overflow-x-auto" ref={exportRef}>
            <table className="min-w-230 w-full">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Member Name</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Karyakarta</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Absent Count</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Follow-up Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {actionRows.map((row, index) => {
                  const message = `Jay Swaminarayan ${row.memberName}, we missed you at the Sabha today. Hope everything is well!`;
                  const whatsappLink = `https://wa.me/91${row.mobile}?text=${encodeURIComponent(message)}`;

                  return (
                    <tr key={`${row.mobile || row.memberName}-${index}`}>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900">{row.memberName}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{row.followup}</td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-900">{row.absentCount}</td>
                      <td className="px-4 py-3">
                        {row.mobile ? (
                          <a
                            href={whatsappLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            WhatsApp
                          </a>
                        ) : (
                          <span className="text-xs font-medium text-slate-400">No mobile</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

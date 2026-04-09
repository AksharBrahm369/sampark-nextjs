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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 sm:py-4">
          <h1 className="text-sm font-bold text-slate-900 sm:text-base">Follow-up Action Page</h1>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Link
              href="/"
              className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-slate-900 sm:flex-none sm:py-1.5"
            >
              Back to Dashboard
            </Link>
            <button
              type="button"
              onClick={exportImage}
              className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-indigo-700 sm:flex-none sm:py-1.5"
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
          <div ref={exportRef}>
            <div className="space-y-3 p-3 sm:hidden">
              {actionRows.map((row, index) => {
                const message = `Jay Swaminarayan ${row.memberName}, we missed you at the Sabha today. Hope everything is well!`;
                const whatsappLink = `https://wa.me/91${row.mobile}?text=${encodeURIComponent(message)}`;

                return (
                  <article
                    key={`${row.mobile || row.memberName}-${index}`}
                    className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <p className="text-sm font-semibold text-slate-900 break-words">{row.memberName}</p>
                    <p className="mt-1 text-xs text-slate-600">Karyakarta: {row.followup}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">
                        Absent: {row.absentCount}
                      </span>
                      {row.mobile ? (
                        <a
                          href={whatsappLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                        >
                          WhatsApp
                        </a>
                      ) : (
                        <span className="text-xs font-medium text-slate-400">No mobile</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="hidden w-full overflow-x-auto pb-4 sm:block">
              <table className="w-full min-w-[720px] border-collapse bg-white text-xs sm:text-sm">
                <thead className="bg-[#f1e1cc]">
                  <tr>
                    <th className="border border-black px-3 py-2 text-left font-bold uppercase tracking-wide text-black">Member Name</th>
                    <th className="border border-black px-3 py-2 text-left font-bold uppercase tracking-wide text-black">Karyakarta</th>
                    <th className="border border-black px-3 py-2 text-center font-bold uppercase tracking-wide text-black">Absent Count</th>
                    <th className="border border-black px-3 py-2 text-center font-bold uppercase tracking-wide text-black">Follow-up Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {actionRows.map((row, index) => {
                    const message = `Jay Swaminarayan ${row.memberName}, we missed you at the Sabha today. Hope everything is well!`;
                    const whatsappLink = `https://wa.me/91${row.mobile}?text=${encodeURIComponent(message)}`;

                    return (
                      <tr key={`${row.mobile || row.memberName}-${index}`} className="hover:bg-slate-50 transition-colors">
                        <td className="border border-black px-3 py-2 font-semibold text-slate-900">{row.memberName}</td>
                        <td className="border border-black px-3 py-2 text-slate-700">{row.followup}</td>
                        <td className="border border-black px-3 py-2 text-center font-bold text-slate-900">{row.absentCount}</td>
                        <td className="border border-black px-3 py-2 text-center">
                          {row.mobile ? (
                            <a
                              href={whatsappLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
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
          </div>
        )}
      </section>
    </main>
  );
}

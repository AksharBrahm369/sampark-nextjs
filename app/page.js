"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import Link from "next/link";
import Papa from "papaparse";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const MASTER_STORAGE_KEY = "sampark_master_database_v1";
const MATCHED_ROWS_STORAGE_KEY = "sampark_weekly_followup_rows_v1";
const REFRESH_WARNING_MESSAGE = "Warning: Refreshing will clear all data. Do you wish to proceed?";

const CHART_COLORS = {
  healthy: "#22c55e",
  risk: "#f59e0b",
  critical: "#ef4444",
  indigo: "#4f46e5",
};

function normalize(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanMobile(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function toNumber(value) {
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function findColumnKey(headers, includesAny) {
  const normalizedHeaders = headers.map((header) => ({
    raw: header,
    normalized: normalize(header),
  }));

  return (
    normalizedHeaders.find(({ normalized }) =>
      includesAny.some((keyword) => normalized.includes(keyword)),
    )?.raw ?? null
  );
}

function findColumnKeySafe(headers, includesAny, excludesAny = []) {
  const normalizedHeaders = headers.map((header) => ({
    raw: header,
    normalized: normalize(header),
  }));

  const exactMatch = normalizedHeaders.find(({ normalized }) =>
    includesAny.some((keyword) => normalized === keyword),
  );
  if (exactMatch && !excludesAny.some((bad) => exactMatch.normalized.includes(bad))) {
    return exactMatch.raw;
  }

  const containsMatch = normalizedHeaders.find(({ normalized }) => {
    const includesWanted = includesAny.some((keyword) => normalized.includes(keyword));
    const includesBad = excludesAny.some((bad) => normalized.includes(bad));
    return includesWanted && !includesBad;
  });

  return containsMatch?.raw ?? null;
}

function tokenSetFromName(value) {
  return new Set(
    normalize(value)
      .split(" ")
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

function tokenOverlapScore(a, b) {
  const setA = tokenSetFromName(a);
  const setB = tokenSetFromName(b);
  if (!setA.size || !setB.size) return 0;

  let common = 0;
  setA.forEach((token) => {
    if (setB.has(token)) common += 1;
  });

  return common / Math.max(setA.size, setB.size);
}

function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, meta }) => {
        resolve({
          rows: Array.isArray(data) ? data : [],
          headers: Array.isArray(meta?.fields) ? meta.fields : [],
        });
      },
      error: reject,
    });
  });
}

export default function HomePage() {
  const weeklyTableRef = useRef(null);
  const [masterRows, setMasterRows] = useState([]);
  const [masterFileName, setMasterFileName] = useState("");
  const [masterUpdatedAt, setMasterUpdatedAt] = useState("");
  const [absentRows, setAbsentRows] = useState([]);
  const [absentFileName, setAbsentFileName] = useState("");
  const [error, setError] = useState("");
  const [selectedKaryakarta, setSelectedKaryakarta] = useState("All");
  const [highlightLimit, setHighlightLimit] = useState(4);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MASTER_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed?.rows)) return;

      setMasterRows(parsed.rows);
      setMasterFileName(parsed.fileName || "Master CSV");
      setMasterUpdatedAt(parsed.updatedAt || "");
    } catch {
      localStorage.removeItem(MASTER_STORAGE_KEY);
    }
  }, []);

  const matchedRows = useMemo(() => {
    if (!masterRows.length || !absentRows.length) return [];

    const masterHeaders = Object.keys(masterRows[0] || {});
    const absentHeaders = Object.keys(absentRows[0] || {});

    const masterFirstNameKey = findColumnKeySafe(masterHeaders, ["first name", "firstname", "given name"], ["date"]);
    const masterLastNameKey = findColumnKeySafe(masterHeaders, ["last name", "lastname", "surname", "family name"], ["date"]);
    const masterNameKey = findColumnKeySafe(
      masterHeaders,
      ["member name", "full name", "name"],
      ["karyakarta", "follow", "volunteer", "sevak", "assigned"],
    );
    const masterMobileKey = findColumnKeySafe(masterHeaders, ["mobile", "phone", "contact", "whatsapp", "number"]);
    const masterFollowupKey = findColumnKeySafe(
      masterHeaders,
      ["followup", "follow up", "karyakarta", "karya", "volunteer", "assigned", "sevak", "caller"],
      ["member", "student", "parent"],
    );
    const masterAbsentKey = findColumnKey(masterHeaders, ["absent", "absence", "missed"]);

    const absentNameKey = findColumnKeySafe(
      absentHeaders,
      ["member name", "full name", "name", "attendee"],
      ["karyakarta", "follow", "volunteer", "sevak", "assigned"],
    );
    const absentMobileKey = findColumnKeySafe(absentHeaders, ["mobile", "phone", "contact", "whatsapp", "number"]);
    const absentAbsentKey = findColumnKeySafe(absentHeaders, ["absent", "absence", "missed", "count"]);
    const absentFollowupKey = findColumnKeySafe(
      absentHeaders,
      ["followup", "follow up", "karyakarta", "karya", "volunteer", "assigned", "sevak", "caller"],
      ["member", "student", "parent"],
    );

    if (!absentNameKey) {
      return [];
    }

    const masterPrepared = masterRows.map((row) => {
      const firstName = masterFirstNameKey ? String(row[masterFirstNameKey] ?? "") : "";
      const lastName = masterLastNameKey ? String(row[masterLastNameKey] ?? "") : "";
      const combinedFullName = `${firstName} ${lastName}`.trim();
      const fallbackName = masterNameKey ? String(row[masterNameKey] ?? "") : "";
      const displayName = combinedFullName || fallbackName;

      return {
        raw: row,
        memberName: displayName,
        normalizedName: normalize(displayName),
        mobile: cleanMobile(masterMobileKey ? row[masterMobileKey] : ""),
        followup: String(masterFollowupKey ? row[masterFollowupKey] : "").trim(),
        absentCount: toNumber(masterAbsentKey ? row[masterAbsentKey] : 0),
      };
    });

    const aggregatedWeekly = new Map();

    absentRows.forEach((absentRow) => {
      const absentName = String(absentRow[absentNameKey] ?? "").trim();
      if (!absentName) return;

      const absentMobile = cleanMobile(absentMobileKey ? absentRow[absentMobileKey] : "");
      const normalizedAbsentName = normalize(absentName);
      const key = absentMobile || normalizedAbsentName;
      const rowCount = Math.max(1, toNumber(absentAbsentKey ? absentRow[absentAbsentKey] : 1));
      const rowFollowup = String(absentFollowupKey ? absentRow[absentFollowupKey] : "").trim();

      if (!aggregatedWeekly.has(key)) {
        aggregatedWeekly.set(key, {
          absentName,
          normalizedAbsentName,
          absentMobile,
          weeklyAbsentCount: rowCount,
          weeklyFollowup: rowFollowup,
        });
        return;
      }

      const existing = aggregatedWeekly.get(key);
      existing.weeklyAbsentCount += rowCount;
      if (!existing.weeklyFollowup && rowFollowup) {
        existing.weeklyFollowup = rowFollowup;
      }
    });

    return Array.from(aggregatedWeekly.values())
      .map((weeklyRow) => {
        const { absentName, normalizedAbsentName, absentMobile, weeklyAbsentCount, weeklyFollowup } = weeklyRow;

        let bestMatch = null;
        let bestMatchScore = -1;
        let matchStatus = "Name-only";

        if (absentMobile) {
          bestMatch = masterPrepared.find((masterRow) => masterRow.mobile === absentMobile) || null;
          if (bestMatch) {
            bestMatchScore = 100;
            matchStatus = "Mobile exact";
          }
        }

        if (!bestMatch) {
          const exactNameMatch =
            masterPrepared.find((masterRow) => masterRow.normalizedName === normalizedAbsentName) || null;
          if (exactNameMatch) {
            bestMatch = exactNameMatch;
            bestMatchScore = 95;
            matchStatus = "Name exact";
          }
        }

        if (!bestMatch) {
          masterPrepared.forEach((masterRow) => {
            const overlap = tokenOverlapScore(normalizedAbsentName, masterRow.normalizedName);

            if (overlap >= 0.67) {
              const score = overlap * 80;
              if (score > bestMatchScore) {
                bestMatch = masterRow;
                bestMatchScore = score;
                matchStatus = "Token fuzzy";
              }
            }

            const masterName = masterRow.normalizedName;
            const minLengthGuard = Math.min(masterName.length, normalizedAbsentName.length) >= 5;
            const includesMatch =
              minLengthGuard &&
              (masterName.includes(normalizedAbsentName) || normalizedAbsentName.includes(masterName));

            if (includesMatch) {
              const score = 55;
              if (score > bestMatchScore) {
                bestMatch = masterRow;
                bestMatchScore = score;
                matchStatus = "Includes fuzzy";
              }
            }
          });
        }

        if (bestMatchScore < 55) {
          bestMatch = null;
          matchStatus = "Name-only";
        }

        const resolvedAbsentCount =
          weeklyAbsentCount > 0 ? weeklyAbsentCount : Math.max(1, toNumber(bestMatch?.absentCount));

        return {
          memberName: bestMatch?.memberName || absentName,
          mobile: bestMatch?.mobile || absentMobile,
          followup: bestMatch?.followup || weeklyFollowup || "Unassigned",
          absentCount: Math.max(1, resolvedAbsentCount),
          matchStatus,
        };
      })
      .filter(Boolean);
  }, [masterRows, absentRows]);

  const hasData = matchedRows.length > 0;
  const hasSessionData = masterRows.length > 0 || absentRows.length > 0 || matchedRows.length > 0;

  useEffect(() => {
    if (!hasSessionData) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      // Modern browsers ignore custom text but still show a confirmation popup.
      event.returnValue = REFRESH_WARNING_MESSAGE;
    };

    const handleRefreshKeys = (event) => {
      const isF5 = event.key === "F5";
      const isCtrlOrCmdR = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r";

      if (!isF5 && !isCtrlOrCmdR) return;

      event.preventDefault();
      const shouldProceed = window.confirm(REFRESH_WARNING_MESSAGE);
      if (shouldProceed) {
        window.location.reload();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("keydown", handleRefreshKeys);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("keydown", handleRefreshKeys);
    };
  }, [hasSessionData]);

  useEffect(() => {
    if (!matchedRows.length) {
      localStorage.removeItem(MATCHED_ROWS_STORAGE_KEY);
      return;
    }

    localStorage.setItem(MATCHED_ROWS_STORAGE_KEY, JSON.stringify(matchedRows));
  }, [matchedRows]);

  const karyakartaOptions = useMemo(() => {
    const names = new Set(matchedRows.map((row) => row.followup || "Unassigned"));
    return ["All", ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  }, [matchedRows]);

  const filteredRows = useMemo(() => {
    const rows =
      selectedKaryakarta === "All"
        ? matchedRows
        : matchedRows.filter((row) => row.followup === selectedKaryakarta);

    return [...rows].sort((a, b) => {
      const followupA = (a.followup || "Unassigned").toLowerCase();
      const followupB = (b.followup || "Unassigned").toLowerCase();
      const followupOrder = followupA.localeCompare(followupB);
      if (followupOrder !== 0) return followupOrder;

      return (a.memberName || "").toLowerCase().localeCompare((b.memberName || "").toLowerCase());
    });
  }, [matchedRows, selectedKaryakarta]);

  const stats = useMemo(() => {
    let healthy = 0;
    let risk = 0;
    let critical = 0;

    filteredRows.forEach((row) => {
      if (row.absentCount <= highlightLimit) {
        healthy += 1;
      } else if (row.absentCount <= 10) {
        risk += 1;
      } else {
        critical += 1;
      }
    });

    return {
      total: filteredRows.length,
      healthy,
      risk,
      critical,
    };
  }, [filteredRows, highlightLimit]);

  const healthChartData = useMemo(() => {
    return [
      { name: `Healthy (<=${highlightLimit})`, value: stats.healthy, color: CHART_COLORS.healthy },
      { name: "At Risk (<=10)", value: stats.risk, color: CHART_COLORS.risk },
      { name: "Critical (>10)", value: stats.critical, color: CHART_COLORS.critical },
    ].filter((item) => item.value > 0);
  }, [stats, highlightLimit]);

  const topAbsentData = useMemo(() => {
    return filteredRows
      .map((row) => ({ name: row.memberName, absences: row.absentCount }))
      .sort((a, b) => b.absences - a.absences)
      .slice(0, 10);
  }, [filteredRows]);

  const karyakartaWorkloadData = useMemo(() => {
    const workloadMap = filteredRows.reduce((acc, row) => {
      const key = row.followup || "Unassigned";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(workloadMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredRows]);

  const uploadMasterCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");

    try {
      const { rows, headers } = await parseCsvFile(file);

      const hasName = Boolean(findColumnKey(headers, ["name", "first", "member"]));
      const hasMobile = Boolean(findColumnKey(headers, ["mobile", "phone", "contact", "number", "whatsapp"]));

      if (!hasName || !hasMobile) {
        setError("Master CSV must contain at least one name-related and one mobile-related column.");
        return;
      }

      const payload = {
        rows,
        fileName: file.name,
        updatedAt: new Date().toISOString(),
      };

      localStorage.setItem(MASTER_STORAGE_KEY, JSON.stringify(payload));
      setMasterRows(rows);
      setMasterFileName(file.name);
      setMasterUpdatedAt(payload.updatedAt);
    } catch {
      setError("Unable to parse Master CSV. Please upload a valid file.");
    }
  };

  const uploadWeeklyAbsentCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setSelectedKaryakarta("All");

    try {
      const { rows, headers } = await parseCsvFile(file);
      const hasName = Boolean(findColumnKey(headers, ["name", "member"]));

      if (!hasName) {
        setError("Weekly Absent CSV must contain a name-related column.");
        return;
      }

      setAbsentRows(rows);
      setAbsentFileName(file.name);
    } catch {
      setError("Unable to parse Weekly Absent CSV. Please upload a valid file.");
    }
  };

  const clearMasterDatabase = () => {
    localStorage.removeItem(MASTER_STORAGE_KEY);
    setMasterRows([]);
    setMasterFileName("");
    setMasterUpdatedAt("");
    setAbsentRows([]);
    setAbsentFileName("");
    setSelectedKaryakarta("All");
  };

  const clearWeeklyData = () => {
    setAbsentRows([]);
    setAbsentFileName("");
    setSelectedKaryakarta("All");
  };

  const exportWeeklyTableImage = async () => {
    if (!weeklyTableRef.current) return;

    try {
      const dataUrl = await toPng(weeklyTableRef.current, {
        cacheBust: true,
        pixelRatio: Math.max(window.devicePixelRatio || 1, 2),
        backgroundColor: "#ffffff",
      });

      const link = document.createElement("a");
      link.download = "weekly-followup-table.png";
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error(err);
      setError("Unable to export Weekly Follow-up Table image right now. Please try again.");
    }
  };

  return (
    <main className="min-h-screen bg-linear-to-br from-slate-100 via-blue-50 to-indigo-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <section className="mb-6 overflow-hidden rounded-3xl border border-indigo-100 bg-white/85 shadow-xl shadow-indigo-200/40 backdrop-blur">
          <div className="bg-linear-to-r from-indigo-700 via-blue-700 to-cyan-600 px-6 py-8">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Sabha Follow-up Command Center
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-indigo-100 sm:text-base">
              Leader-ready weekly operations dashboard with persistent master data, smart matching, and instant follow-up actions.
            </p>
          </div>

          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-2">
            <div className="hidden rounded-2xl border border-indigo-100 bg-linear-to-b from-white to-indigo-50/70 p-4 shadow-sm" aria-hidden="true">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Step 1</p>
              <h2 className="mt-1 text-sm font-bold text-slate-900">Upload Master CSV</h2>
              <p className="mt-1 text-xs text-slate-600">Saved in browser memory. Upload only when master data changes.</p>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={uploadMasterCsv}
                className="mt-3 block w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:font-semibold file:text-white hover:file:bg-indigo-700"
              />
              {masterFileName && (
                <p className="mt-2 text-xs font-medium text-emerald-700">
                  Loaded: {masterFileName}
                  {masterUpdatedAt ? ` (${new Date(masterUpdatedAt).toLocaleString()})` : ""}
                </p>
              )}
              <button
                type="button"
                onClick={clearMasterDatabase}
                className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
              >
                Reset Master Database
              </button>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-linear-to-b from-white to-blue-50/70 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Step 2</p>
              <h2 className="mt-1 text-sm font-bold text-slate-900">Upload Weekly Absent CSV</h2>
              <p className="mt-1 text-xs text-slate-600">Runs fuzzy matching against your saved master database.</p>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={uploadWeeklyAbsentCsv}
                className="mt-3 block w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:font-semibold file:text-white hover:file:bg-blue-700"
              />
              {absentFileName && (
                <p className="mt-2 text-xs font-medium text-emerald-700">Loaded: {absentFileName}</p>
              )}
              <button
                type="button"
                onClick={clearWeeklyData}
                className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Clear Weekly File
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900">Controls</h2>
              <label htmlFor="karyakarta-filter" className="mt-3 block text-xs font-semibold text-slate-600">Filter by Karyakarta</label>
              <select
                id="karyakarta-filter"
                value={selectedKaryakarta}
                onChange={(event) => setSelectedKaryakarta(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500"
              >
                {karyakartaOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              <label htmlFor="healthy-threshold" className="mt-3 block text-xs font-semibold text-slate-600">Healthy Threshold (Absences)</label>
              <input
                id="healthy-threshold"
                type="number"
                min="1"
                max="100"
                step="1"
                inputMode="numeric"
                value={highlightLimit}
                onChange={(event) => setHighlightLimit(Math.max(1, Number(event.target.value) || 1))}
                className="mt-1 w-full max-w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-base font-semibold text-slate-700 outline-none focus:border-indigo-500 sm:max-w-32 sm:text-sm"
              />

              <p className="mt-3 text-xs text-slate-500">
                Smart column detection accepts headers containing words like name/mobile/followup.
              </p>
            </div>
          </div>

          {error && (
            <div className="mx-5 mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 sm:mx-6">
              {error}
            </div>
          )}
        </section>

        {hasData && (
          <>
            <section className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <div className="rounded-2xl border border-indigo-100 bg-white p-3 sm:p-4 shadow-md shadow-indigo-100/60 flex flex-col justify-center">
                <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-indigo-500 truncate">Total Follow-ups</p>
                <p className="mt-1 sm:mt-2 text-2xl sm:text-3xl font-black text-slate-900">{stats.total}</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-white p-3 sm:p-4 shadow-md shadow-emerald-100/60 flex flex-col justify-center">
                <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-emerald-500 truncate">Healthy</p>
                <p className="mt-1 sm:mt-2 text-2xl sm:text-3xl font-black text-slate-900">{stats.healthy}</p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-white p-3 sm:p-4 shadow-md shadow-amber-100/60 flex flex-col justify-center">
                <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-amber-500 truncate">At Risk</p>
                <p className="mt-1 sm:mt-2 text-2xl sm:text-3xl font-black text-slate-900">{stats.risk}</p>
              </div>
              <div className="rounded-2xl border border-rose-100 bg-white p-3 sm:p-4 shadow-md shadow-rose-100/60 flex flex-col justify-center">
                <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-rose-500 truncate">Critical</p>
                <p className="mt-1 sm:mt-2 text-2xl sm:text-3xl font-black text-slate-900">{stats.critical}</p>
              </div>
            </section>

            <section className="-mx-4 mb-6 overflow-hidden rounded-none border-0 bg-transparent shadow-none sm:mx-0 sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-white sm:shadow-lg sm:shadow-slate-200/60">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between border-b border-slate-300 bg-[#f1e1cc] px-3 py-3 sm:border-slate-200 sm:bg-slate-50 sm:px-4 sm:py-3">
                <h3 className="text-sm leading-tight font-bold text-slate-900">Weekly Follow-up Table</h3>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <Link
                    href="/follow-up-action"
                    className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-slate-900 sm:flex-none sm:py-1.5"
                  >
                    Open Action Page
                  </Link>
                  <button
                    type="button"
                    onClick={exportWeeklyTableImage}
                    className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-indigo-700 sm:flex-none sm:py-1.5"
                  >
                    Export as Image
                  </button>
                </div>
              </div>

              <div className="w-full overflow-x-auto pb-4">
                <table ref={weeklyTableRef} className="mx-auto w-auto border-collapse bg-white text-[11px] sm:text-[12px] leading-tight">
                  <thead className="bg-white">
                    <tr>
                      <th className="border border-black px-1.5 py-0.5 text-center font-bold text-black">Member Name</th>
                      <th className="border border-black px-1.5 py-0.5 text-center font-bold text-black">Mobile</th>
                      <th className="border border-black px-1.5 py-0.5 text-center font-bold text-black">Followup</th>
                      <th className="border border-black px-1.5 py-0.5 text-center font-bold text-black">Absent Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, index) => {
                      const orangeHighlight =
                        row.absentCount >= 1 && row.absentCount <= highlightLimit;

                      return (
                        <tr
                          key={`${row.mobile || row.memberName}-${index}`}
                          className={orangeHighlight ? "bg-[#f1e1cc]" : "bg-white"}
                        >
                          <td className="border border-black px-1.5 py-0.5 text-center font-medium text-black">{row.memberName}</td>
                          <td className="border border-black px-1.5 py-0.5 text-center text-black">{row.mobile || "-"}</td>
                          <td className="border border-black px-1.5 py-0.5 text-center text-black">{row.followup}</td>
                          <td className="border border-black px-1.5 py-0.5 text-center text-black">{row.absentCount}</td>
                        </tr>
                      );
                    })}

                    {!filteredRows.length && (
                      <tr>
                        <td colSpan={4} className="border border-black px-2 py-2 text-center text-[11px] font-medium text-slate-500 bg-white">
                          No matched members found for the current filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mb-6 grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-indigo-100/40">
                <h3 className="text-sm font-bold text-slate-900">Attendance Health Distribution</h3>
                <p className="mt-1 text-xs text-slate-500">Recharts visual for leadership-level snapshot</p>
                <div className="mt-4 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={healthChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={95}
                        paddingAngle={2}
                        label={({ value }) => value}
                      >
                        {healthChartData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value, name) => [value, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-blue-100/40">
                <h3 className="text-sm font-bold text-slate-900">Karyakarta Workload</h3>
                <p className="mt-1 text-xs text-slate-500">How many members each Karyakarta needs to call</p>
                <div className="mt-4 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={karyakartaWorkloadData} margin={{ top: 8, right: 8, left: 0, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" angle={-25} textAnchor="end" height={62} tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill={CHART_COLORS.indigo} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/70">
              <h3 className="text-sm font-bold text-slate-900">Top 10 Most Absent Members</h3>
              <div className="mt-4 h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topAbsentData} margin={{ top: 8, right: 8, left: 0, bottom: 65 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" angle={-30} textAnchor="end" height={72} tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="absences" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

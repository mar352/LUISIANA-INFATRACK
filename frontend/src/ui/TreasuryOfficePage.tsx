import React, { useState, useEffect, useMemo } from "react";
import { io } from "socket.io-client";
import { fetchCitizenApplications, patchCitizenApplication, backendUrl } from "../lib/api";
import type { SessionUser } from "../services/auth";
import "./TreasuryOfficePage.css";

type Props = {
  onLogout: () => void;
  session?: SessionUser | null;
};

export default function TreasuryOfficePage({ onLogout, session }: Props) {
  // Tabs: Tab 1 "For Payment" (Queue) | Tab 2 "Paid / Completed" (History)
  const [activeTab, setActiveTab] = useState<"for_payment" | "paid_history">("for_payment");

  // Date Range Filter for Tab 2 History & EOD Reporting
  type DateRangeFilter = "today" | "yesterday" | "last7" | "this_month" | "all";
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>("today");

  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Express Teller Bar State (One-Click Quick Lookup & Processing)
  const [expressInput, setExpressInput] = useState("");
  const [expressSearching, setExpressSearching] = useState(false);
  const [expressMessage, setExpressMessage] = useState<{ text: string; type: "info" | "warn" | "error" | "success" } | null>(null);

  // Modal State
  const [selectedApp, setSelectedApp] = useState<any | null>(null);
  const [orNumber, setOrNumber] = useState("");
  const [amountPaid, setAmountPaid] = useState<number>(280);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Active teller identification
  const tellerId = session?.username || session?.fullName || "treasury_teller";

  const loadApplications = async () => {
    setLoading(true);
    try {
      const data = await fetchCitizenApplications();
      setApplications(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn("[Treasury] Error loading applications:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApplications();

    let socket: any = null;
    try {
      socket = io(backendUrl(""), {
        transports: ["websocket", "polling"],
        withCredentials: true,
      });

      const handleApplicationUpdated = (payload: any) => {
        if (!payload) return;
        const appPayload = payload.application;
        const tracking = (payload.trackingNumber || "").toUpperCase();
        const targetId = payload.id;

        setApplications((prev) => {
          const index = prev.findIndex(
            (a) => (targetId && a.id === targetId) || (tracking && (a.trackingNumber || "").toUpperCase() === tracking)
          );
          if (index >= 0) {
            const next = [...prev];
            next[index] = appPayload || { ...next[index], ...payload };
            return next;
          }
          if (appPayload) {
            return [appPayload, ...prev];
          }
          return prev;
        });
      };

      socket.on("planning:application_updated", handleApplicationUpdated);
    } catch {
      /* ignore realtime fallback */
    }

    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Helper Extractors
  const getTrackingNumber = (app: any): string => {
    return app.trackingNumber || app.trackingNo || app.id || "—";
  };

  const getPaymentNumber = (app: any): string => {
    return (
      app.payment?.orderOfPaymentNo ||
      app.orderOfPaymentNo ||
      app.paymentNumber ||
      (app.trackingNumber ? `OP-${new Date().getFullYear()}-${app.trackingNumber.slice(-4)}` : "OP-PENDING")
    );
  };

  const getApplicantName = (app: any): string => {
    return app.applicant?.fullName || app.applicantName || "—";
  };

  const getProjectType = (app: any): string => {
    const raw =
      app.lotDetails?.proposedBuildingType ||
      app.property?.proposedBuildingType ||
      app.projectTitle ||
      app.title;
    if (raw && String(raw).trim()) return String(raw).trim();
    if (app.category === "private_infrastructure") return "Residential Infrastructure";
    if (app.category === "agricultural") return "Agricultural Facility";
    if (app.category === "municipal_project") return "Municipal Project";
    return "Residential Infrastructure";
  };

  const getMpdcApprovalDate = (app: any): string => {
    const raw =
      app.stepProgress?.step2At ||
      app.payment?.issuedAt ||
      app.updatedAt ||
      app.createdAt;
    if (!raw) return "Kasalukuyan";
    try {
      return new Date(raw).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Kasalukuyan";
    }
  };

  const getPaymentDateRaw = (app: any): string | null => {
    return (
      app.payment?.payment_date ||
      app.payment?.paidAt ||
      app.payment_date ||
      app.stepProgress?.step3At ||
      app.updatedAt ||
      null
    );
  };

  const isDateToday = (dStr?: string | null): boolean => {
    if (!dStr) return false;
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  };

  const matchesDateRange = (dStr: string | null | undefined, filter: DateRangeFilter): boolean => {
    if (filter === "all") return true;
    if (!dStr) return false;
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return false;
    const now = new Date();

    if (filter === "today") {
      return (
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      );
    }

    if (filter === "yesterday") {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return (
        d.getDate() === yesterday.getDate() &&
        d.getMonth() === yesterday.getMonth() &&
        d.getFullYear() === yesterday.getFullYear()
      );
    }

    if (filter === "last7") {
      const past7 = new Date();
      past7.setDate(now.getDate() - 7);
      past7.setHours(0, 0, 0, 0);
      return d >= past7 && d <= now;
    }

    if (filter === "this_month") {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }

    return true;
  };

  // Overdue Aging calculation for Tab 1 (MPDC Approval > 30 days)
  const getApprovalAgeInDays = (app: any): number => {
    const raw =
      app.stepProgress?.step2At ||
      app.payment?.issuedAt ||
      app.updatedAt ||
      app.createdAt;
    if (!raw) return 0;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return 0;
    const diffMs = Date.now() - d.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  };

  const getPaymentDate = (app: any): string => {
    const raw = getPaymentDateRaw(app);
    if (!raw) return "—";
    try {
      return new Date(raw).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "—";
    }
  };

  const getOrNumber = (app: any): string => {
    return (
      app.payment?.or_number ||
      app.payment?.orNumber ||
      app.or_number ||
      app.orNumber ||
      "—"
    );
  };

  const getAmountPaid = (app: any): number => {
    const val =
      app.payment?.amount_paid ??
      app.payment?.amount ??
      app.amount_paid ??
      app.payment?.feeAmount;
    return typeof val === "number" && !isNaN(val) ? val : 280;
  };

  // Queue logic:
  // An application belongs to "For Payment" if it has been cleared/approved by MPDC
  // and is awaiting payment and NOT yet paid.
  const isApplicationPaid = (app: any): boolean => {
    return (
      app.payment?.status === "paid" ||
      Boolean(app.payment?.or_number) ||
      Boolean(app.payment?.orNumber) ||
      Boolean(app.or_number) ||
      app.status === "for_engineering_inspection" ||
      app.status === "PENDING_ENGINEERING_INSPECTION" ||
      app.status === "inspection_completed" ||
      app.status === "approved" ||
      app.status === "completed"
    );
  };

  // Filtered Queues (Tab 1: For Payment)
  const queueApps = useMemo(() => {
    return applications.filter((app) => {
      const paid = isApplicationPaid(app);
      if (paid) return false;
      // Must be pending payment
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchPayment = getPaymentNumber(app).toLowerCase().includes(q);
        const matchTrack = getTrackingNumber(app).toLowerCase().includes(q);
        const matchName = getApplicantName(app).toLowerCase().includes(q);
        const matchProj = getProjectType(app).toLowerCase().includes(q);
        return matchPayment || matchTrack || matchName || matchProj;
      }
      return true;
    });
  }, [applications, searchTerm]);

  // Filtered History (Tab 2: Paid / Completed) with Date Range Filter
  const historyApps = useMemo(() => {
    return applications.filter((app) => {
      const paid = isApplicationPaid(app);
      if (!paid) return false;

      const rawDate = getPaymentDateRaw(app);
      if (!matchesDateRange(rawDate, dateRangeFilter)) {
        return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchPayment = getPaymentNumber(app).toLowerCase().includes(q);
        const matchTrack = getTrackingNumber(app).toLowerCase().includes(q);
        const matchName = getApplicantName(app).toLowerCase().includes(q);
        const matchOr = getOrNumber(app).toLowerCase().includes(q);
        return matchPayment || matchTrack || matchName || matchOr;
      }
      return true;
    });
  }, [applications, searchTerm, dateRangeFilter]);

  // Daily Collection Widgets (Quick Stats)
  const quickStats = useMemo(() => {
    let totalCollectionToday = 0;
    let processedTodayCount = 0;

    applications.forEach((app) => {
      if (isApplicationPaid(app)) {
        const rawDate = getPaymentDateRaw(app);
        if (isDateToday(rawDate)) {
          processedTodayCount += 1;
          totalCollectionToday += getAmountPaid(app);
        }
      }
    });

    const pendingPaymentsCount = applications.filter((app) => !isApplicationPaid(app)).length;

    return {
      totalToday: totalCollectionToday,
      processedToday: processedTodayCount,
      pendingPayments: pendingPaymentsCount,
    };
  }, [applications]);

  // Open the Payment Processing Modal with pre-computed Order of Payment fee
  const handleOpenProcessPayment = (app: any) => {
    setSelectedApp(app);
    // Generate suggested default OR number format: OR-LUIS-YYYY-XXXXX
    const year = new Date().getFullYear();
    const rand = Math.floor(10000 + Math.random() * 90000);
    setOrNumber(`OR-LUIS-${year}-${rand}`);

    // Auto-compute total amount from Order of Payment or fee breakdown
    const rawAmount =
      app.payment?.amount ??
      app.payment?.feeAmount ??
      (Array.isArray(app.payment?.feeBreakdown)
        ? app.payment.feeBreakdown.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0)
        : null) ??
      280;
    setAmountPaid(Number(rawAmount) || 280);
    setExpressMessage(null);
  };

  // Express One-Click Lookup by Payment Number (Order of Payment No.)
  const handleExpressLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = expressInput.trim().toUpperCase();
    if (!query) {
      setExpressMessage({ text: "Pakilagay ang Payment Number (Order of Payment No.) ng aplikante.", type: "warn" });
      return;
    }

    setExpressSearching(true);
    setExpressMessage(null);

    let target = applications.find((a) => {
      const op = getPaymentNumber(a).trim().toUpperCase();
      const t = getTrackingNumber(a).trim().toUpperCase();
      const id = (a.id || "").trim().toUpperCase();
      return op === query || t === query || id === query || op.includes(query) || t.includes(query);
    });

    if (!target) {
      try {
        const res = await fetch(backendUrl(`/api/citizen/applications/${encodeURIComponent(query)}`));
        if (res.ok) {
          const json = await res.json();
          if (json.ok && json.application) {
            target = json.application;
            setApplications((prev) => [target, ...prev.filter((p) => p.id !== target.id)]);
          }
        }
      } catch (err) {
        console.warn("[Treasury] Lookup error:", err);
      }
    }

    setExpressSearching(false);

    if (!target) {
      setExpressMessage({
        text: `Walang natagpuang bayarin para sa Payment Number na "${query}". Pakitiyak kung wasto ang reference number.`,
        type: "error",
      });
      return;
    }

    if (isApplicationPaid(target)) {
      setActiveTab("paid_history");
      setSearchTerm(query);
      setExpressMessage({
        text: `✓ Bayad na ang aplikasyong ito (${getPaymentNumber(target)} · O.R. #${getOrNumber(target)}) sa halagang ₱${getAmountPaid(target).toLocaleString()} noong ${getPaymentDate(target)}.`,
        type: "info",
      });
      return;
    }

    const st = (target.status || "").toLowerCase();
    const isApprovedByMpdc =
      st === "for_payment" ||
      st === "approved_for_payment" ||
      st === "ocular_inspection" ||
      st === "for_engineering_inspection" ||
      st === "approved" ||
      Boolean(target.payment?.orderOfPaymentNo);

    if (!isApprovedByMpdc && (st === "submitted" || st === "in_review" || st === "flagged")) {
      setExpressMessage({
        text: `Kasalukuyan pang sumasailalim sa MPDC Zoning Review ang aplikasyong ito (${getPaymentNumber(target)}). Wala pang inilalabas na Order of Payment mula sa MPDC.`,
        type: "warn",
      });
      return;
    }

    handleOpenProcessPayment(target);
  };

  // Confirm Payment and execute Backend State Change
  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;

    const trimmedOr = orNumber.trim();
    if (!trimmedOr) {
      alert("Mangyaring ilagay ang Official Receipt (O.R.) Number.");
      return;
    }

    const numAmount = Number(amountPaid);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert("Mangyaring ilagay ang wastong halaga ng ibinayad.");
      return;
    }

    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const targetId = selectedApp.id || selectedApp.trackingNumber;

      // Backend State Change:
      // - or_number, amount_paid, payment_date, user_id
      // - status shift: PENDING_TREASURY_PAYMENT -> PENDING_ENGINEERING_INSPECTION (for_engineering_inspection)
      await patchCitizenApplication(targetId, {
        status: "for_engineering_inspection",
        status_alias: "PENDING_ENGINEERING_INSPECTION",
        or_number: trimmedOr,
        amount_paid: numAmount,
        payment_date: nowIso,
        user_id: tellerId,
        payment: {
          status: "paid",
          or_number: trimmedOr,
          orNumber: trimmedOr,
          amount_paid: numAmount,
          amount: numAmount,
          feeAmount: numAmount,
          payment_date: nowIso,
          paidAt: nowIso,
          user_id: tellerId,
          cashier: tellerId,
          issuedBy: `Municipal Treasury Office (${tellerId})`,
        },
      });

      showToast(
        `✓ Matagumpay na naproseso ang bayad (O.R. #${trimmedOr}) para sa ${getPaymentNumber(selectedApp)} (${getApplicantName(selectedApp)})! Awtomatikong lumipat sa Stage 4 at inendorso sa Engineering Office.`
      );
      setSelectedApp(null);
      setExpressInput("");
      setExpressMessage(null);
      await loadApplications();
    } catch (err: any) {
      console.error("[Treasury] Payment confirmation failed:", err);
      alert(`Hindi naitala ang bayad: ${err?.message || "Subukan muli."}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Export EOD Collection Report as CSV / Excel
  const handleExportEodReport = () => {
    if (historyApps.length === 0) {
      alert("Walang transaksyon na naitala sa napiling filter upang i-export.");
      return;
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const formattedDate = now.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const formattedTime = now.toLocaleTimeString("en-PH");

    const filterLabels: Record<DateRangeFilter, string> = {
      all: "Lahat ng Rekord",
      today: "Ngayong Araw",
      yesterday: "Kahapon",
      last7: "Huling 7 Araw",
      this_month: "Kasalukuyang Buwan",
    };

    const grandTotal = historyApps.reduce((sum, a) => sum + getAmountPaid(a), 0);

    const rows: string[] = [];
    rows.push("BAYAN NG LUISIANA - TANGGAPAN NG INGAT-YAMAN");
    rows.push("END OF DAY (EOD) COLLECTION REPORT / ULAT NG KOLEKSYON SA PAGTATAPOS NG ARAW");
    rows.push(`Petsa ng Ulat:,"${formattedDate} ${formattedTime}"`);
    rows.push(`Kahera / Teller:,"${tellerId}"`);
    rows.push(`Saklaw ng Filter:,"${filterLabels[dateRangeFilter]}"`);
    rows.push(`Kabuuang Halaga ng Koleksyon:,"PHP ${grandTotal.toFixed(2)}"`);
    rows.push(`Kabuuang Bilang ng Transaksyon:,${historyApps.length}`);
    rows.push("");
    rows.push("Blg.,Payment Number (Order of Payment),Pangalan ng Aplikante,Uri ng Proyekto,O.R. Number,Halaga (PHP),Petsa ng Pagbabayad,Kahera/Teller");

    historyApps.forEach((app, idx) => {
      const no = idx + 1;
      const op = `"${getPaymentNumber(app).replace(/"/g, '""')}"`;
      const name = `"${getApplicantName(app).replace(/"/g, '""')}"`;
      const proj = `"${getProjectType(app).replace(/"/g, '""')}"`;
      const or = `"${getOrNumber(app).replace(/"/g, '""')}"`;
      const amount = getAmountPaid(app).toFixed(2);
      const pDate = `"${getPaymentDate(app)}"`;
      const cashier = `"${(app.payment?.user_id || app.payment?.cashier || tellerId).replace(/"/g, '""')}"`;
      rows.push(`${no},${op},${name},${proj},${or},${amount},${pDate},${cashier}`);
    });

    rows.push("");
    rows.push(`,,,,GRAND TOTAL,${grandTotal.toFixed(2)},,`);
    rows.push("");
    rows.push(`Pinatunayan ni (Cashier/Teller):,"${tellerId}","Municipal Treasury Office"`);
    rows.push(`Nilagdaan ni (Municipal Treasurer):,"___________________________","Petsa: ${formattedDate}"`);

    const csvContent = "\uFEFF" + rows.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `EOD_Collection_Report_Luisiana_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`✓ Matagumpay na na-download ang EOD Collection Report (${historyApps.length} transaksyon)!`);
  };

  // Printable EOD Report Preview for Remittance
  const handlePrintEodReport = () => {
    if (historyApps.length === 0) {
      alert("Walang transaksyon na naitala sa napiling filter upang i-print.");
      return;
    }
    const now = new Date();
    const formattedDate = now.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const grandTotal = historyApps.reduce((sum, a) => sum + getAmountPaid(a), 0);

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      alert("Pakibuksan ang popups para makapag-print ng EOD Report.");
      return;
    }

    const tableRowsHtml = historyApps
      .map(
        (app, idx) => `
        <tr>
          <td style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: center;">${idx + 1}</td>
          <td style="padding: 7px 8px; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold; color: #0284c7;">${getPaymentNumber(app)}</td>
          <td style="padding: 7px 8px; border: 1px solid #cbd5e1;">${getApplicantName(app)}</td>
          <td style="padding: 7px 8px; border: 1px solid #cbd5e1;">${getProjectType(app)}</td>
          <td style="padding: 7px 8px; border: 1px solid #cbd5e1; font-family: monospace; color: #059669; font-weight: bold;">${getOrNumber(app)}</td>
          <td style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">₱${getAmountPaid(app).toLocaleString()}.00</td>
          <td style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: center;">${getPaymentDate(app)}</td>
        </tr>
      `
      )
      .join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>EOD Collection Report - Luisiana Treasury</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; padding: 28px; margin: 0; }
            .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 18px; }
            .sub { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #475569; margin: 0; }
            .title { font-size: 19px; font-weight: 800; margin: 4px 0; color: #0f172a; }
            .rep-title { font-size: 14px; font-weight: 700; color: #059669; margin: 4px 0 0; }
            .meta { display: flex; justify-content: space-between; margin-bottom: 14px; font-size: 12.5px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11.5px; }
            th { background: #f1f5f9; padding: 8px; border: 1px solid #cbd5e1; font-weight: 700; text-align: left; }
            .grand-total { font-size: 13.5px; font-weight: 800; text-align: right; margin-bottom: 24px; padding: 8px 12px; background: #f8fafc; border: 1px solid #cbd5e1; }
            .sign-grid { display: flex; justify-content: space-between; margin-top: 36px; }
            .sign-box { width: 45%; text-align: center; }
            .sign-line { border-top: 1px solid #0f172a; margin-top: 40px; padding-top: 6px; font-weight: 700; font-size: 12.5px; }
            .sign-title { font-size: 11px; color: #64748b; }
            @media print { button { display: none; } body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <p class="sub">Republika ng Pilipinas · Lalawigan ng Laguna</p>
            <h1 class="title">BAYAN NG LUISIANA · TANGGAPAN NG INGAT-YAMAN</h1>
            <div class="rep-title">END OF DAY (EOD) DAILY COLLECTION REPORT</div>
          </div>
          <div class="meta">
            <div>
              <strong>Petsa ng Ulat:</strong> ${formattedDate}<br/>
              <strong>Kahera / Teller:</strong> ${tellerId}
            </div>
            <div style="text-align: right;">
              <strong>Bilang ng Transaksyon:</strong> ${historyApps.length}<br/>
              <strong>Kabuuang Koleksyon:</strong> ₱${grandTotal.toLocaleString()}.00
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 30px; text-align: center;">#</th>
                <th>Payment No. (Order of Payment)</th>
                <th>Pangalan ng Aplikante</th>
                <th>Proyekto</th>
                <th>O.R. No.</th>
                <th style="text-align: right;">Halaga</th>
                <th style="text-align: center;">Petsa ng Bayad</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
          </table>
          <div class="grand-total">
            KABUUANG REMITTANCE (GRAND TOTAL): ₱${grandTotal.toLocaleString()}.00
          </div>
          <div class="sign-grid">
            <div class="sign-box">
              <div class="sign-line">${tellerId}</div>
              <div class="sign-title">Municipal Treasury Teller / Cashier</div>
            </div>
            <div class="sign-box">
              <div class="sign-line">MUNICIPAL TREASURER</div>
              <div class="sign-title">Head of Treasury Office / Approving Officer</div>
            </div>
          </div>
          <div style="text-align: center; margin-top: 20px;">
            <button onclick="window.print()" style="padding: 8px 18px; font-size: 13px; font-weight: 600; cursor: pointer; background: #059669; color: #fff; border: none; border-radius: 6px;">I-print ang Kopya</button>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Daily Audit Summary for Tab 2
  const totalAuditAmount = useMemo(() => {
    return historyApps.reduce((sum, a) => sum + getAmountPaid(a), 0);
  }, [historyApps]);

  return (
    <div className="to-dashboard-root">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="to-toast-notice">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="to-navbar">
        <div className="to-navbar-brand">
          <img src="/logo.png" alt="Bayan ng Luisiana" className="to-seal-logo" />
          <div className="to-brand-text">
            <span className="to-brand-sub">Bayan ng Luisiana · Lalawigan ng Laguna</span>
            <h1 className="to-brand-title">Tanggapan ng Ingat-Yaman (Municipal Treasury Office)</h1>
          </div>
        </div>

        <div className="to-navbar-actions">
          <div className="to-teller-badge">
            <span className="to-teller-dot" />
            <span>Teller: <strong>{tellerId}</strong></span>
          </div>
          <button type="button" className="to-logout-action" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="to-content-shell">
        {/* Express Teller Bar: One-Click Quick Lookup & Processing */}
        <section className="to-express-hero">
          <h2 className="to-express-heading">
            I-type ang Payment Number ng Kliyente (Order of Payment)
          </h2>

          <form className="to-express-form" onSubmit={handleExpressLookup}>
            <div className="to-express-input-wrap">
              <span className="to-express-input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                className="to-express-input"
                placeholder="Hal. OP-2026-9078 (I-type ang Payment Number at pindutin ang Enter)…"
                value={expressInput}
                onChange={(e) => {
                  setExpressInput(e.target.value);
                  if (expressMessage) setExpressMessage(null);
                }}
              />
              {expressInput && (
                <button
                  type="button"
                  className="to-express-clear"
                  onClick={() => {
                    setExpressInput("");
                    setExpressMessage(null);
                  }}
                  title="Burahin"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="submit"
              className="to-express-btn"
              disabled={expressSearching || !expressInput.trim()}
            >
              {expressSearching ? (
                <span>Kinakarga…</span>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <rect x="2" y="6" width="20" height="12" rx="2" />
                    <circle cx="12" cy="12" r="2" />
                    <path d="M6 12h.01M18 12h.01" />
                  </svg>
                  <span>Hanapin ang Payment Number at I-proseso →</span>
                </>
              )}
            </button>
          </form>

          {expressMessage && (
            <div className={`to-express-msg-alert ${expressMessage.type}`}>
              <span>{expressMessage.text}</span>
            </div>
          )}
        </section>

        {/* Daily Collection Widgets (Quick Stats) */}
        <section className="to-stats-grid">
          {/* Card 1: Total Collection Today */}
          <div className="to-stat-card primary">
            <div className="to-stat-icon-wrap emerald">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <div className="to-stat-content">
              <span className="to-stat-label">Total Collection Today</span>
              <div className="to-stat-value green">₱{quickStats.totalToday.toLocaleString()}.00</div>
              <span className="to-stat-sub">Kabuuang perang pumasok sa araw na ito</span>
            </div>
          </div>

          {/* Card 2: Processed Today */}
          <div className="to-stat-card">
            <div className="to-stat-icon-wrap blue">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>
            <div className="to-stat-content">
              <span className="to-stat-label">Processed Today</span>
              <div className="to-stat-value blue">{quickStats.processedToday}</div>
              <span className="to-stat-sub">Aplikanteng nakapagbayad ngayong araw</span>
            </div>
          </div>

          {/* Card 3: Pending Payments */}
          <div className="to-stat-card">
            <div className="to-stat-icon-wrap amber">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className="to-stat-content">
              <span className="to-stat-label">Pending Payments</span>
              <div className="to-stat-value amber">{quickStats.pendingPayments}</div>
              <span className="to-stat-sub">Na-approve ng MPDC na naghihintay sa counter</span>
            </div>
          </div>
        </section>

        {/* Navigation Tabs (Tab 1 & Tab 2) */}
        <div className="to-tabs-header">
          <div className="to-tabs-group">
            <button
              type="button"
              className={`to-tab-item ${activeTab === "for_payment" ? "active" : ""}`}
              onClick={() => setActiveTab("for_payment")}
            >
              <span>Tab 1: "For Payment" (Queue)</span>
              <span className={`to-badge-pill ${queueApps.length > 0 ? "warn" : "muted"}`}>
                {queueApps.length}
              </span>
            </button>

            <button
              type="button"
              className={`to-tab-item ${activeTab === "paid_history" ? "active" : ""}`}
              onClick={() => setActiveTab("paid_history")}
            >
              <span>Tab 2: "Paid / Completed" (History)</span>
              <span className="to-badge-pill neutral">{historyApps.length}</span>
            </button>
          </div>

          {/* Minimalist Search & Refresh */}
          <div className="to-controls-group">
            <div className="to-search-wrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder={
                  activeTab === "for_payment"
                    ? "Hanapin ayon sa Payment No., Pangalan, o Tracking No.…"
                    : "Hanapin ayon sa Payment No., O.R. No., o Pangalan…"
                }
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  type="button"
                  className="to-clear-search"
                  onClick={() => setSearchTerm("")}
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="button"
              className="to-refresh-btn"
              onClick={loadApplications}
              disabled={loading}
              title="I-refresh ang talaan"
            >
              {loading ? "Kinakarga…" : "I-refresh"}
            </button>
          </div>
        </div>

        {/* =========================================================================
            TAB 1: "FOR PAYMENT" (QUEUE)
            Columns: Payment Number (Order of Payment) | Pangalan ng Aplikante | Uri ng Proyekto | Petsa ng MPDC Approval | Action Button: "I-proseso ang Bayad"
           ========================================================================= */}
        {activeTab === "for_payment" && (
          <div className="to-table-card">
            <div className="to-table-container">
              <table className="to-data-table">
                <thead>
                  <tr>
                    <th>Payment Number (Order of Payment)</th>
                    <th>Pangalan ng Aplikante</th>
                    <th>Uri ng Proyekto (hal. Residential)</th>
                    <th>Petsa ng MPDC Approval</th>
                    <th style={{ textAlign: "right" }}>Aksyon</th>
                  </tr>
                </thead>
                <tbody>
                  {queueApps.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="to-empty-state">
                        <div className="to-empty-inner">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ffc107" strokeWidth="1.8">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          <h4>Walang Nakapilang Aplikasyon na May Order of Payment</h4>
                          <p>
                            Lahat ng na-aprubahan ng MPDC ay nabayaran na o wala pang bagong aplikasyong naghihintay ng singil.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    queueApps.map((app) => {
                      const ageDays = getApprovalAgeInDays(app);
                      const isOverdue = ageDays >= 30;

                      return (
                        <tr key={app.id || app.trackingNumber} className={isOverdue ? "to-row-overdue" : ""}>
                          <td>
                            <span className="to-op-code">{getPaymentNumber(app)}</span>
                          </td>
                          <td>
                            <div className="to-applicant-name">{getApplicantName(app)}</div>
                          </td>
                          <td>
                            <span className="to-project-type">{getProjectType(app)}</span>
                          </td>
                          <td>
                            <div className="to-approval-date-wrapper">
                              <span className={`to-approval-date ${isOverdue ? "overdue-text" : ""}`}>
                                {getMpdcApprovalDate(app)}
                              </span>
                              {isOverdue && (
                                <span
                                  className="to-aging-badge"
                                  title={`Mahigit ${ageDays} araw nang na-aprubahan ng MPDC ngunit hindi pa binabayaran (posibleng abandonado)`}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                    <line x1="12" y1="9" x2="12" y2="13" />
                                    <line x1="12" y1="17" x2="12.01" y2="17" />
                                  </svg>
                                  <span>&gt;30 Araw (Aging)</span>
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className="to-btn-process-payment"
                              onClick={() => handleOpenProcessPayment(app)}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <rect x="2" y="6" width="20" height="12" rx="2" />
                                <circle cx="12" cy="12" r="2" />
                                <path d="M6 12h.01M18 12h.01" />
                              </svg>
                              I-proseso ang Bayad
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: "PAID / COMPLETED" (HISTORY)
            Columns: Payment Number | Pangalan | O.R. Number | Halaga (₱) | Petsa ng Pagbayad
           ========================================================================= */}
        {activeTab === "paid_history" && (
          <div className="to-table-card">
            {/* End of Day Audit Summary Bar & Actions Toolbar */}
            <div className="to-audit-bar">
              <div className="to-audit-stats">
                <div className="to-audit-item">
                  <span className="to-audit-lbl">Bilang ng Transaksyon:</span>
                  <strong className="to-audit-val">{historyApps.length}</strong>
                </div>
                <div className="to-audit-item">
                  <span className="to-audit-lbl">Kabuuang Nakolekta (Audit Total):</span>
                  <strong className="to-audit-val highlight">₱{totalAuditAmount.toLocaleString()}.00</strong>
                </div>
              </div>

              <div className="to-audit-controls">
                {/* Date Range Filter */}
                <div className="to-date-filter-wrap">
                  <label htmlFor="historyDateFilter" className="to-date-filter-lbl">
                    Petsa:
                  </label>
                  <select
                    id="historyDateFilter"
                    className="to-date-filter-select"
                    value={dateRangeFilter}
                    onChange={(e) => setDateRangeFilter(e.target.value as DateRangeFilter)}
                  >
                    <option value="today">Ngayong Araw (Today)</option>
                    <option value="yesterday">Kahapon (Yesterday)</option>
                    <option value="last7">Huling 7 Araw (Last 7 Days)</option>
                    <option value="this_month">Kasalukuyang Buwan (This Month)</option>
                    <option value="all">Lahat ng Rekord (All Records)</option>
                  </select>
                </div>

                {/* EOD Report Buttons */}
                <div className="to-eod-buttons">
                  <button
                    type="button"
                    className="to-btn-eod export"
                    onClick={handleExportEodReport}
                    title="I-download ang End of Day (EOD) Collection Report bilang CSV / Excel"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>Generate EOD Report (Excel)</span>
                  </button>

                  <button
                    type="button"
                    className="to-btn-eod print"
                    onClick={handlePrintEodReport}
                    title="I-print o i-save bilang PDF ang EOD Report para sa remittance"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polyline points="6 9 6 2 18 2 18 9" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" />
                    </svg>
                    <span>I-print (PDF)</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="to-table-container">
              <table className="to-data-table">
                <thead>
                  <tr>
                    <th>Payment Number (Order of Payment)</th>
                    <th>Pangalan</th>
                    <th>O.R. Number</th>
                    <th>Halaga (₱)</th>
                    <th>Petsa ng Pagbayad</th>
                  </tr>
                </thead>
                <tbody>
                  {historyApps.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="to-empty-state">
                        <div className="to-empty-inner">
                          <h4>Walang Tala ng Pagbabayad para sa Napiling Petsa</h4>
                          <p>
                            Walang natagpuang transaksyon para sa filter na ito. Piliin ang "Lahat ng Rekord" kung nais makita ang buong kasaysayan ng mga nagdaang transaksyon.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    historyApps.map((app) => (
                      <tr key={app.id || app.trackingNumber}>
                        <td>
                          <span className="to-op-code">{getPaymentNumber(app)}</span>
                        </td>
                        <td>
                          <div className="to-applicant-name">{getApplicantName(app)}</div>
                        </td>
                        <td>
                          <span className="to-or-badge">{getOrNumber(app)}</span>
                        </td>
                        <td>
                          <strong className="to-amount-val">₱{getAmountPaid(app).toLocaleString()}.00</strong>
                        </td>
                        <td>
                          <span className="to-payment-date">{getPaymentDate(app)}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* =========================================================================
          2. ANG PAYMENT PROCESSING MODAL
          - Read-Only Details: Payment Number, Pangalan ng Aplikante, Project
          - Input Fields: Official Receipt (O.R.) Number (Required), Halaga ng Binayaran (₱) (Required)
          - Action Buttons: ✅ "Kumpirmahin at I-save" | ❌ "Kanselahin"
         ========================================================================= */}
      {selectedApp && (
        <div className="to-modal-backdrop" onClick={() => setSelectedApp(null)}>
          <div className="to-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="to-dialog-header">
              <h3 className="to-dialog-title">Kagawaran ng Ingat-Yaman · Pagproseso ng Bayad</h3>
              <button
                type="button"
                className="to-dialog-close"
                onClick={() => setSelectedApp(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmPayment}>
              <div className="to-dialog-body">
                {/* Read-Only Details */}
                <div className="to-readonly-box">
                  <div className="to-readonly-row highlight-op">
                    <span className="to-readonly-label">Payment Number (Order of Payment):</span>
                    <strong className="to-readonly-value op-highlight">
                      {getPaymentNumber(selectedApp)}
                    </strong>
                  </div>

                  <div className="to-readonly-row">
                    <span className="to-readonly-label">Pangalan ng Aplikante:</span>
                    <strong className="to-readonly-value">
                      {getApplicantName(selectedApp)}
                    </strong>
                  </div>

                  <div className="to-readonly-row">
                    <span className="to-readonly-label">Uri ng Proyekto:</span>
                    <span className="to-readonly-value">
                      {getProjectType(selectedApp)}
                    </span>
                  </div>
                </div>

                {/* Amount Due Card & Breakdown */}
                <div className="to-amount-summary-card">
                  <div className="to-amount-summary-label">Kabuuang Babayaran (Order of Payment Amount Due):</div>
                  <div className="to-amount-summary-val">₱{amountPaid.toFixed(2)}</div>
                  {Array.isArray(selectedApp.payment?.feeBreakdown) && selectedApp.payment.feeBreakdown.length > 0 && (
                    <div className="to-fee-breakdown-list">
                      {selectedApp.payment.feeBreakdown.map((item: any, idx: number) => (
                        <div key={idx} className="to-fee-item">
                          <span>{item.item || item.label}</span>
                          <strong>₱{Number(item.amount).toFixed(2)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Input Fields */}
                <div className="to-input-section">
                  <div className="to-input-field">
                    <label htmlFor="orNumberInput">
                      Official Receipt (O.R.) Number <span className="req">*</span>
                    </label>
                    <input
                      id="orNumberInput"
                      type="text"
                      placeholder="Hal. OR-LUIS-2026-9078"
                      value={orNumber}
                      onChange={(e) => setOrNumber(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  <div className="to-input-field">
                    <label htmlFor="amountPaidInput">
                      Halaga ng Binayaran (₱) <span className="req">*</span>
                    </label>
                    <input
                      id="amountPaidInput"
                      type="number"
                      min="1"
                      step="1"
                      placeholder="280"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(Number(e.target.value))}
                      required
                    />
                  </div>
                </div>


              </div>

              {/* Action Buttons */}
              <div className="to-dialog-actions">
                <button
                  type="button"
                  className="to-btn-cancel"
                  onClick={() => setSelectedApp(null)}
                  disabled={isSubmitting}
                >
                  Kanselahin
                </button>
                <button
                  type="submit"
                  className="to-btn-confirm"
                  disabled={isSubmitting}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{isSubmitting ? "Ipinoproseso ang Bayad…" : "I-proseso ang Bayad"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

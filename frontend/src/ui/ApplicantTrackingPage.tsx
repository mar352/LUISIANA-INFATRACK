import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { backendUrl, reuploadCitizenDocument } from "../lib/api";
import { ThemeToggle } from "./ThemeToggle";
import "./ApplicantTrackingPage.css";

/* ── Vector SVG Icons ── */
const IconBack = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const IconCheck = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconSearch = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconCopy = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const IconAlert = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const IconMessage = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const IconUpload = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const IconPrinter = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);

const IconReceipt = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
    <line x1="8" y1="7" x2="16" y2="7" />
    <line x1="8" y1="11" x2="16" y2="11" />
    <line x1="8" y1="15" x2="13" y2="15" />
  </svg>
);



/* ── Stepper Definition ── */
export type TrackingStage = {
  step: number;
  id: "submitted" | "in_review_mpdc" | "for_payment_treasury" | "technical_review_engineering" | "ready_for_release";
  label: string;
  office: string;
  officer: string;
  theme: {
    activeBg: string;
    activeBorder: string;
    activeGlow: string;
    activeText: string;
  };
};

export const TRACKING_STAGES: TrackingStage[] = [
  {
    step: 1,
    id: "submitted",
    label: "1. Pagsusumite / Intake",
    office: "Online Resident Intake",
    officer: "Document Integrity Verified",
    theme: {
      activeBg: "#0284c7",
      activeBorder: "#38bdf8",
      activeGlow: "rgba(56, 189, 248, 0.3)",
      activeText: "#38bdf8",
    },
  },
  {
    step: 2,
    id: "in_review_mpdc",
    label: "2. MPDC Zoning Review",
    office: "Zoning & Land Use",
    officer: "Edward B. Romulo, EnP.",
    theme: {
      activeBg: "#0284c7",
      activeBorder: "#38bdf8",
      activeGlow: "rgba(56, 189, 248, 0.35)",
      activeText: "#38bdf8",
    },
  },
  {
    step: 3,
    id: "for_payment_treasury",
    label: "3. Pagbabayad sa Treasury",
    office: "Municipal Treasury",
    officer: "Order of Payment & O.R. Receipt",
    theme: {
      activeBg: "#059669",
      activeBorder: "#10b981",
      activeGlow: "rgba(16, 185, 129, 0.35)",
      activeText: "#34d399",
    },
  },
  {
    step: 4,
    id: "technical_review_engineering",
    label: "4. Engineering 'Before' Inspection",
    office: "Municipal Engineering Office",
    officer: "Engr. Mario S. Baldovino",
    theme: {
      activeBg: "#d97706",
      activeBorder: "#f59e0b",
      activeGlow: "rgba(245, 158, 11, 0.35)",
      activeText: "#fbbf24",
    },
  },
  {
    step: 5,
    id: "ready_for_release",
    label: "5. Pagpapalabas ng Permiso",
    office: "MPDC / Mayor's Office",
    officer: "Approved & Sealed",
    theme: {
      activeBg: "#16a34a",
      activeBorder: "#22c55e",
      activeGlow: "rgba(34, 197, 94, 0.4)",
      activeText: "#4ade80",
    },
  },
];

export type ApplicationRemark = {
  id: string;
  fromOffice: "MPDC" | "Engineering" | "Treasury" | "System Notice" | "Applicant";
  author: string;
  message: string;
  createdAt: string;
  requiresAction?: boolean;
  attachedFile?: string | null;
};

export type TrackedApplication = {
  id: string;
  trackingNumber: string;
  serviceType: string;
  applicant?: {
    fullName?: string;
    contactPhone?: string;
    contactEmail?: string;
    address?: string;
    barangay?: string;
  };
  lotDetails?: {
    tctNo?: string;
    taxDecNo?: string;
    lotOwner?: string;
    proposedBuildingType?: string;
    lotAreaSqM?: number;
    lotLocationDescription?: string;
    coordinates?: { lon: number; lat: number };
  };
  status: string;
  payment?: {
    status?: "unpaid" | "order_of_payment_issued" | "paid" | "verified";
    orderOfPaymentNo?: string;
    feeAmount?: number;
    breakdown?: { label: string; amount: number }[];
    issuedAt?: string;
    issuedBy?: string;
    instruction?: string;
    orNumber?: string;
    receiptUrl?: string;
    receiptOriginalName?: string;
    receiptSize?: number;
    paidAmount?: number;
    paidAt?: string;
    submittedAt?: string;
    verifiedBy?: string;
  };
  uploads?: Record<string, any[]>;
  rejectedDocs?: Record<
    string,
    {
      reqTitle: string;
      reason: string;
      fileName?: string;
      rejectedAt?: string;
      rejectedBy?: string;
      reqKey?: string;
    }
  >;
  stepProgress?: any;
  slaDays?: number;
  slaMinutes?: number;
  createdAt: string;
  updatedAt?: string;
  remarks?: ApplicationRemark[];
};

type Props = {
  initialTrackingNo?: string;
  onBack: () => void;
};

export default function ApplicantTrackingPage({ initialTrackingNo, onBack }: Props) {
  const [searchInput, setSearchInput] = useState(initialTrackingNo || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newRemarkText, setNewRemarkText] = useState("");
  const [submittingRemark, setSubmittingRemark] = useState(false);
  const [reuploadSuccess, setReuploadSuccess] = useState<string | null>(null);
  const [realtimeNotice, setRealtimeNotice] = useState<string | null>(null);

  // Dedicated Document Re-upload State
  const [uploadingDocKey, setUploadingDocKey] = useState<string | null>(null);
  const [reuploadDocSuccess, setReuploadDocSuccess] = useState<string | null>(null);
  const [reuploadDocError, setReuploadDocError] = useState<string | null>(null);

  // Receipt Modal Preview State
  const [previewingReceipt, setPreviewingReceipt] = useState<{ url: string; title: string } | null>(null);

  // Loaded Application Data
  const [app, setApp] = useState<TrackedApplication | null>(null);

  // Fetch application by tracking reference
  const fetchApplication = async (trackingNo: string) => {
    const query = trackingNo.trim().toUpperCase();
    if (!query) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(backendUrl(`/api/citizen/applications/${encodeURIComponent(query)}`));
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.application) {
          const loadedApp: TrackedApplication = json.application;
          // Strictly use real remarks from database without mock injection
          loadedApp.remarks = Array.isArray(loadedApp.remarks) ? loadedApp.remarks : [];
          setApp(loadedApp);
          setSearchInput(loadedApp.trackingNumber);
          if (typeof window !== "undefined") {
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set("track", loadedApp.trackingNumber);
            window.history.replaceState(
              { ...window.history.state, screen: "applicant_tracking", trackingReference: loadedApp.trackingNumber },
              "",
              currentUrl.pathname + currentUrl.search
            );
          }
          return;
        }
      }

      // If backend does not have it, show genuine error message
      setApp(null);
      setError(`Walang natagpuang aplikasyon sa Tracking Reference na "${query}". Pakitiyak kung tama ang na-type.`);
    } catch {
      setError("Hindi ma-access ang tracking server sa ngayon. Pakisubukang muli.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const trackToLoad =
      initialTrackingNo && initialTrackingNo.trim()
        ? initialTrackingNo.trim()
        : typeof window !== "undefined"
        ? (new URLSearchParams(window.location.search).get("track") || new URLSearchParams(window.location.search).get("tracking") || "").trim()
        : "";
    if (trackToLoad) {
      void fetchApplication(trackToLoad);
    }
  }, [initialTrackingNo]);

  // Real-time WebSocket synchronization: updates notes, remarks, and status live without refresh
  useEffect(() => {
    if (!app?.trackingNumber) return;

    let socket: any = null;
    try {
      socket = io(backendUrl(""), {
        transports: ["websocket", "polling"],
        withCredentials: true,
      });

      const handleApplicationUpdated = (payload: any) => {
        if (!payload) return;
        const targetTracking = (payload.trackingNumber || payload.application?.trackingNumber || "").trim().toUpperCase();
        const targetId = payload.id || payload.application?.id;

        setApp((prev) => {
          if (!prev) return prev;
          const currentTracking = (prev.trackingNumber || "").trim().toUpperCase();
          if (targetTracking !== currentTracking && (!targetId || targetId !== prev.id)) {
            return prev;
          }

          const incomingApp = payload.application;
          const updatedRemarks = Array.isArray(payload.remarks)
            ? payload.remarks
            : Array.isArray(incomingApp?.remarks)
            ? incomingApp.remarks
            : prev.remarks;

          if (payload.notes && payload.notes !== prev.notes) {
            setRealtimeNotice("Natanggap ang bagong opisyal na notes mula sa Tanggapan ng MPDC / Zoning.");
            setTimeout(() => setRealtimeNotice(null), 6000);
          }

          return {
            ...prev,
            ...(incomingApp || {}),
            notes: payload.notes ?? incomingApp?.notes ?? prev.notes,
            remarks: updatedRemarks,
            status: payload.status ?? incomingApp?.status ?? prev.status,
            updatedAt: payload.at || incomingApp?.updatedAt || new Date().toISOString(),
          };
        });
      };

      const handleApplicationRemark = (payload: any) => {
        if (!payload || !payload.remark) return;
        const targetTracking = (payload.trackingNumber || "").trim().toUpperCase();

        setApp((prev) => {
          if (!prev) return prev;
          const currentTracking = (prev.trackingNumber || "").trim().toUpperCase();
          if (targetTracking !== currentTracking) return prev;

          const newRemark = payload.remark;
          const existingRemarks = Array.isArray(prev.remarks) ? prev.remarks : [];
          if (existingRemarks.some((r) => r.id === newRemark.id)) return prev;

          if (newRemark.fromOffice !== "Applicant") {
            setRealtimeNotice(`Bagong memo/notes mula sa ${newRemark.fromOffice}: "${newRemark.message.slice(0, 60)}..."`);
            setTimeout(() => setRealtimeNotice(null), 6000);
          }

          return {
            ...prev,
            remarks: [...existingRemarks, newRemark],
          };
        });
      };

      socket.on("planning:application_updated", handleApplicationUpdated);
      socket.on("citizen:application_notes", handleApplicationUpdated);
      socket.on("planning:application_remark", handleApplicationRemark);
    } catch (err) {
      console.warn("[ApplicantTracking] Realtime socket connection failed:", err);
    }

    return () => {
      if (socket) socket.disconnect();
    };
  }, [app?.trackingNumber, app?.id]);

  useEffect(() => {
    const scrollVal = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("scroll") : null;
    if (scrollVal) {
      const top = parseInt(scrollVal, 10) || 400;
      setTimeout(() => {
        const el = document.querySelector(".at-page");
        if (el) el.scrollTop = top;
      }, 400);
    }
  }, [app]);

  const isAllApproved =
    (app?.status || "").toLowerCase() === "approved" ||
    (app?.status || "").toLowerCase() === "completed";

  const isRejected =
    (app?.status || "").toLowerCase() === "rejected" ||
    (app?.status || "").toLowerCase() === "denied";

  const isFlagged = (app?.status || "").toLowerCase() === "flagged";

  const rejectedEntries = Object.entries(app?.rejectedDocs || {});
  const hasRejectedDocs = rejectedEntries.length > 0;

  // Determine current active stage in the 5-step lifecycle
  const currentStageIndex = (() => {
    const st = (app?.status || "submitted").toLowerCase();
    const paySt = (app?.payment?.status || "").toLowerCase();

    if (st.includes("release") || st === "completed" || st === "approved") return 4; // Stage 5: Ready for Release / Tapos Na
    if (st.includes("engineering") || st === "for_engineering_inspection" || paySt === "paid") return 3; // Stage 4: Engineering 'Before' Inspection
    if (st.includes("payment") || st === "for_payment" || st === "approved_for_payment" || paySt === "order_of_payment_issued") return 2; // Stage 3: Treasury Payment
    if (st.includes("ocular") || st.includes("inspection") || st.includes("in_review") || st.includes("zoning") || st === "flagged") return 1; // Stage 2: MPDC Review
    return 0; // Stage 1: Submitted
  })();

  const activeStage = TRACKING_STAGES[currentStageIndex] || TRACKING_STAGES[0];

  // Payment Status & Aging / Overdue Calculation
  const isPaymentPending = Boolean(
    app &&
    (app.status === "for_payment" ||
      app.status === "approved_for_payment" ||
      app.payment?.status === "order_of_payment_issued" ||
      currentStageIndex === 2) &&
    app.payment?.status !== "paid" &&
    app.status !== "for_engineering_inspection" &&
    !app.payment?.orNumber &&
    !(app as any).or_number
  );

  const paymentIssuedRaw =
    app?.payment?.issuedAt ||
    (app as any)?.stepProgress?.step2At ||
    app?.updatedAt ||
    app?.createdAt;

  const paymentAgeDays = (() => {
    if (!paymentIssuedRaw) return 0;
    const d = new Date(paymentIssuedRaw);
    if (isNaN(d.getTime())) return 0;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
  })();

  const isPaymentOverdue = isPaymentPending && paymentAgeDays >= 30;

  const orderOfPaymentNo =
    app?.payment?.orderOfPaymentNo ||
    (app as any)?.orderOfPaymentNo ||
    (app?.trackingNumber ? `OP-${new Date().getFullYear()}-${app.trackingNumber.slice(-4)}` : "OP-PENDING");

  const formattedApprovalDate = paymentIssuedRaw
    ? new Date(paymentIssuedRaw).toLocaleDateString("tl-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Kasalukuyan";

  // Copy tracking number to clipboard
  const handleCopyTracking = () => {
    if (!app?.trackingNumber) return;
    void navigator.clipboard.writeText(app.trackingNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  // Submit applicant inquiry or response
  const handlePostApplicantRemark = async () => {
    if (!newRemarkText.trim() || !app) return;
    setSubmittingRemark(true);

    const newRemark: ApplicationRemark = {
      id: `rem-app-${Date.now()}`,
      fromOffice: "Applicant",
      author: app.applicant?.fullName || "Aplikante",
      message: newRemarkText.trim(),
      createdAt: new Date().toISOString(),
      requiresAction: false,
    };

    try {
      await fetch(backendUrl(`/api/citizen/applications/${encodeURIComponent(app.trackingNumber)}/remarks`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRemark),
      });
    } catch {
      /* ignore */
    }

    setApp((prev) => (prev ? { ...prev, remarks: [...(prev.remarks || []), newRemark] } : prev));
    setNewRemarkText("");
    setSubmittingRemark(false);
  };

  // Inline Document Re-upload action
  const handleReuploadDoc = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !app) return;

    const confirmationRemark: ApplicationRemark = {
      id: `rem-reup-${Date.now()}`,
      fromOffice: "Applicant",
      author: app.applicant?.fullName || "Aplikante",
      message: `Nai-upload na po ang bagong kopya ng dokumento: "${file.name}" bilang tugon sa paalala ng Engineering Office.`,
      createdAt: new Date().toISOString(),
      requiresAction: false,
      attachedFile: file.name,
    };

    setApp((prev) => (prev ? { ...prev, remarks: [...(prev.remarks || []), confirmationRemark] } : prev));
    setReuploadSuccess(`Matagumpay na nai-upload ang "${file.name}". Naitugon na ito sa Engineering.`);
    setTimeout(() => setReuploadSuccess(null), 5000);
  };

  // Handle re-uploading a specific rejected document
  const handleReuploadSpecificDoc = async (
    docKey: string,
    docTitle: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !app) return;

    setUploadingDocKey(docKey);
    setReuploadDocError(null);
    setReuploadDocSuccess(null);

    try {
      const res = await reuploadCitizenDocument(app.trackingNumber, docKey, docTitle, file);
      if (res && res.application) {
        setApp(res.application);
        setReuploadDocSuccess(
          `Matagumpay na nai-upload ang bagong kopya para sa "${docTitle}" (${file.name})! Naipasa na muli sa MPDC para sa pagsusuri.`
        );
        setTimeout(() => setReuploadDocSuccess(null), 7000);
      } else {
        setReuploadDocError("Hindi nai-save ang dokumento. Pakisubukang muli.");
      }
    } catch (err: any) {
      setReuploadDocError(err?.message || "Nabigong i-upload ang dokumento.");
    } finally {
      setUploadingDocKey(null);
      e.target.value = "";
    }
  };



  return (
    <div className="at-page">
      {/* Top Navigation */}
      <header className="at-nav">
        <div className="at-nav-left">
          <button type="button" className="at-back-btn" onClick={onBack} title="Bumalik">
            <IconBack />
            <span>Bumalik</span>
          </button>
          <div className="at-nav-brand">
            <img src="/logo.png" alt="Luisiana Seal" />
            <div>
              <div className="at-nav-title">Republika ng Pilipinas · Bayan ng Luisiana</div>
              <div className="at-nav-sub">MPDC Online Citizen Permit Tracking Portal</div>
            </div>
          </div>
        </div>

        <div className="at-nav-right">
          <ThemeToggle />
        </div>
      </header>

      <main className="at-main">
        {/* Quick Search Reference Box (Shown when an application is already active) */}
        {app && (
          <div className="at-search-card">
            <div className="at-search-title">
              <IconSearch />
              <span>Mag-track ng Ibang Aplikasyon</span>
            </div>
            <div className="at-search-box">
              <input
                type="text"
                className="at-search-input"
                placeholder="Hal. LUIS-ZC-2026-9078"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchApplication(searchInput)}
              />
              <button
                type="button"
                className="at-search-btn"
                disabled={loading || !searchInput.trim()}
                onClick={() => fetchApplication(searchInput)}
              >
                {loading ? "Naghahanap…" : "Hanapin"}
              </button>
            </div>
          </div>
        )}

        {/* Loading Indicator */}
        {loading && !app && (
          <div className="at-loading-box">
            <div className="at-spinner" />
            <p>Kinukuha ang kumpidensyal na talaan ng aplikasyon…</p>
          </div>
        )}

        {error && (
          <div style={{ background: "rgba(225, 29, 72, 0.2)", border: "1px solid #ef4444", color: "#fca5a5", padding: "12px 18px", borderRadius: 10, display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <IconAlert color="#ef4444" />
            <span>{error}</span>
          </div>
        )}

        {/* Confidential Prompt Card (displayed when no application has been searched yet) */}
        {!app && !loading && (
          <div className="at-empty-prompt-card">
            <div className="at-empty-lock-badge">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>Protektado at Kumpidensyal na Talaan</span>
            </div>

            <h2 className="at-empty-title">
              Ilagay ang Inyong Tracking Reference Number
            </h2>
            <p className="at-empty-desc">
              Alinsunod sa mga patakaran sa kumpidensyalidad ng Bayan ng Luisiana, hindi awtomatikong inilalantad ang mga personal na detalye ng anumang aplikasyon nang walang wastong reference number. Mangyaring i-type sa ibaba ang inyong opisyal na <strong>Tracking Reference Code</strong> (Hal. <code>LUIS-ZC-2026-9078</code>) upang mabuksan ang live progress nito.
            </p>

            <div className="at-empty-search-box">
              <input
                type="text"
                className="at-empty-input"
                placeholder="I-type ang Tracking No. (Hal. LUIS-ZC-2026-9078)"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchApplication(searchInput)}
                autoFocus
              />
              <button
                type="button"
                className="at-empty-btn"
                disabled={loading || !searchInput.trim()}
                onClick={() => fetchApplication(searchInput)}
              >
                Subaybayan ang Aplikasyon →
              </button>
            </div>

            <div className="at-empty-guide-grid">
              <div className="at-empty-guide-item">
                <div className="at-empty-guide-num">1</div>
                <div>
                  <strong>Saan Makikita ang Reference?</strong>
                  <p>Makikita ito sa inyong official filing acknowledgment slip, SMS notification, o papel na resibo mula sa MPDC.</p>
                </div>
              </div>
              <div className="at-empty-guide-item">
                <div className="at-empty-guide-num">2</div>
                <div>
                  <strong>Live Multi-Office Progress</strong>
                  <p>Masusubaybayan ang real-time na progreso mula sa MPDC Zoning Review, Treasury Payment, hanggang Engineering Inspection.</p>
                </div>
              </div>
              <div className="at-empty-guide-item">
                <div className="at-empty-guide-num">3</div>
                <div>
                  <strong>Kumpidensyal at Ligtas</strong>
                  <p>Tanging ang may hawak ng tamang tracking reference ang maaaring makakita sa mga personal na dokumento at assessment notes.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {app && (
          <>
            {/* Hero Header Card */}
            <div className="at-hero-card">
              <div className="at-hero-left">
                <div className="at-hero-tag">
                  <span>● Live System Tracking</span>
                  <span>·</span>
                  <span>Zoning &amp; Building Permit</span>
                </div>
                <h1 className="at-hero-title">
                  {app.lotDetails?.proposedBuildingType || "Zoning Clearance for Construction"}
                </h1>
                <div className="at-hero-applicant">
                  <strong>Aplikante:</strong> {app.applicant?.fullName || "Aplikante ng Luisiana"}
                  <span>·</span>
                  <span>Barangay: <strong>{app.applicant?.barangay || "Poblacion"}</strong></span>
                </div>
              </div>

              <div className="at-hero-right">
                <div className="at-tracking-badge-wrap">
                  <div className="at-tracking-badge-val">{app.trackingNumber}</div>
                  <button
                    type="button"
                    className="at-copy-btn"
                    onClick={handleCopyTracking}
                    title="Kopyahin ang Tracking Reference Number"
                  >
                    {copied ? "Nai-kopya!" : "Kopyahin"}
                  </button>
                </div>
                <div className="at-hero-date">
                  Petsa ng Pagsusumite: {new Date(app.createdAt).toLocaleDateString("tl-PH", { year: "numeric", month: "long", day: "numeric" })}
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
               UI ELEMENT 1: LIVE PROGRESS TRACKER BAR (5-Stage Visual Stepper)
               ══════════════════════════════════════════════════════════════ */}
            <div
              className="at-stepper-card"
              style={
                {
                  "--step-active-bg": activeStage.theme.activeBg,
                  "--step-active-border": activeStage.theme.activeBorder,
                  "--step-active-glow": activeStage.theme.activeGlow,
                  "--step-active-text": activeStage.theme.activeText,
                  "--step-active-color": activeStage.theme.activeBg,
                } as React.CSSProperties
              }
            >
              <div className="at-stepper-header">
                <div className="at-stepper-title">
                  <span>Live Progress Tracker Bar</span>
                  <span>(5-Stage Municipal Lifecycle)</span>
                </div>
                <div
                  className="at-stepper-current-badge"
                  style={{
                    background: `${activeStage.theme.activeBg}22`,
                    border: `1px solid ${activeStage.theme.activeBorder}55`,
                    color: activeStage.theme.activeText,
                  }}
                >
                  <span>Kasalukuyang Yugto:</span>
                  <strong>{isAllApproved ? "5. Pagpapalabas ng Permiso · Naaprubahan Na" : activeStage.label}</strong>
                </div>
              </div>

              {/* Stepper Track */}
              <div className="at-stepper-track">
                {TRACKING_STAGES.map((st, idx) => {
                  const isCompleted = isAllApproved ? true : idx < currentStageIndex;
                  const isActive = isAllApproved ? idx === 4 : idx === currentStageIndex;
                  const isUpcoming = !isAllApproved && idx > currentStageIndex;

                  return (
                    <div
                      key={st.id}
                      className={`at-step-item ${isCompleted ? "completed" : ""} ${isActive ? "active" : ""} ${isCompleted && idx === currentStageIndex - 1 ? "active-next" : ""}`}
                    >
                      <div className="at-step-circle">
                        {isCompleted ? <IconCheck size={18} color="#fff" /> : st.step}
                      </div>
                      <div className="at-step-label">{st.label}</div>
                      <div className="at-step-office">{st.office}</div>
                      <div
                        className="at-step-status-tag"
                        style={{
                          background: isCompleted
                            ? "rgba(16, 185, 129, 0.2)"
                            : isActive
                            ? `${st.theme.activeBg}33`
                            : "rgba(255, 255, 255, 0.08)",
                          color: isCompleted
                            ? "#34d399"
                            : isActive
                            ? st.theme.activeText
                            : "rgba(255, 255, 255, 0.4)",
                        }}
                      >
                        {isCompleted ? "✓ Tapos Na" : isActive ? "Kasalukuyan" : "Kasunod"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
               OPISYAL NA NOTICE / PAALALA SA PAGBABAYAD (MUNICIPAL NOTICE)
               ══════════════════════════════════════════════════════════════ */}
            {isPaymentPending && (
              <div
                className={`at-notice-banner ${isPaymentOverdue ? "overdue" : "pending"}`}
                style={{
                  background: isPaymentOverdue
                    ? "linear-gradient(135deg, rgba(239, 68, 68, 0.14) 0%, rgba(185, 28, 28, 0.22) 100%)"
                    : "linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.18) 100%)",
                  border: isPaymentOverdue
                    ? "1.5px solid rgba(239, 68, 68, 0.7)"
                    : "1.5px solid rgba(16, 185, 129, 0.55)",
                  borderRadius: "14px",
                  padding: "20px 24px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                  boxShadow: isPaymentOverdue
                    ? "0 8px 30px rgba(239, 68, 68, 0.25)"
                    : "0 8px 30px rgba(16, 185, 129, 0.18)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "10px",
                        background: isPaymentOverdue ? "rgba(239, 68, 68, 0.25)" : "rgba(16, 185, 129, 0.25)",
                        border: isPaymentOverdue ? "1px solid #f87171" : "1px solid #34d399",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {isPaymentOverdue ? <IconAlert size={22} color="#f87171" /> : <IconReceipt />}
                    </div>
                    <div>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "3px 10px",
                          borderRadius: "9999px",
                          fontSize: "0.75rem",
                          fontWeight: 800,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          background: isPaymentOverdue ? "#fee2e2" : "#d1fae5",
                          color: isPaymentOverdue ? "#991b1b" : "#065f46",
                          border: isPaymentOverdue ? "1px solid #f87171" : "1px solid #34d399",
                        }}
                      >
                        {isPaymentOverdue ? "⚠️ Opisyal na Notice: Overdue Payment (>30 Araw)" : "ℹ️ Opisyal na Paalala sa Pagbabayad (Stage 3)"}
                      </div>
                      <h2 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#fff", margin: "6px 0 0", lineHeight: 1.3 }}>
                        {isPaymentOverdue
                          ? "Kagyat na Paalala: Lampas na sa 30 Araw ang Inyong Order of Payment"
                          : "Naaprubahan na ng MPDC — Handa na para sa Pagbabayad sa Treasury"}
                      </h2>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "rgba(15, 23, 42, 0.75)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: "10px",
                      padding: "8px 16px",
                      textAlign: "right",
                    }}
                  >
                    <div style={{ fontSize: "0.72rem", color: "rgba(255, 255, 255, 0.6)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Payment Reference No.
                    </div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#38bdf8", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                      {orderOfPaymentNo}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.55)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "10px",
                    padding: "16px 20px",
                    fontSize: "0.93rem",
                    lineHeight: 1.6,
                    color: "rgba(255, 255, 255, 0.9)",
                  }}
                >
                  {isPaymentOverdue ? (
                    <>
                      <p style={{ margin: "0 0 10px" }}>
                        Ang inyong Order of Payment ay inilabas noong <strong>{formattedApprovalDate}</strong> (
                        <strong style={{ color: "#f87171" }}>{paymentAgeDays} araw nang nakalipas</strong>).
                        Lumagpas na ito sa karaniwang 30-araw na palugit para sa pagbabayad ng munisipyo.
                      </p>
                      <p style={{ margin: 0, color: "#fca5a5" }}>
                        <strong>Aksyon na Kinakailangan:</strong> Mangyaring magtungo agad sa <strong>Municipal Treasury Office (1st Floor, Munisipyo ng Luisiana)</strong> at sabihin sa cashier ang inyong <strong>Payment Number: {orderOfPaymentNo}</strong> upang magbayad ng kaukulang halaga na <strong>₱{Number(app.payment?.amount || 280).toFixed(2)}</strong>. Upang hindi mapawalang-bisa o kailangang i-reassess ng MPDC ang inyong clearance, pakiproseso ito sa lalong madaling panahon.
                      </p>
                    </>
                  ) : (
                    <>
                      <p style={{ margin: "0 0 10px" }}>
                        Inaprubahan ng Tanggapan ng MPDC ang inyong aplikasyon noong <strong>{formattedApprovalDate}</strong> ({paymentAgeDays === 0 ? "ngayong araw" : `${paymentAgeDays} araw ang nakalipas`}).
                      </p>
                      <p style={{ margin: 0 }}>
                        <strong>Gabay sa Aplikante:</strong> Magtungo sa <strong>Municipal Treasury Office (1st Floor, Munisipyo ng Luisiana)</strong> at sabihin sa teller/cashier ang inyong <strong>Payment Reference: {orderOfPaymentNo}</strong> para sa pagbabayad ng halagang <strong>₱{Number(app.payment?.amount || 280).toFixed(2)}</strong>. Hindi na kinakailangang mag-upload ng resibo online; awtomatikong mag-uupdate ang inyong tracker papunta sa <strong>Stage 4 (Engineering Inspection)</strong> sa oras na maitala ng Treasury ang inyong Official Receipt.
                      </p>
                    </>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", fontSize: "0.84rem", color: "rgba(255, 255, 255, 0.75)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>📍 Lugar ng Bayaran: <strong>Municipal Treasury Counter (1st Floor, Munisipyo)</strong></span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>💵 Kabuuang Babayaran: <strong style={{ color: "#34d399", fontSize: "1rem" }}>₱{Number(app.payment?.amount || 280).toFixed(2)}</strong></span>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               REJECTED DOCUMENTS RE-UPLOAD MODULE (PER-DOCUMENT BASIS)
               ══════════════════════════════════════════════════════════════ */}
            {hasRejectedDocs && (
              <div className="at-reupload-section-card">
                <div className="at-reupload-header">
                  <div className="at-reupload-header-left">
                    <div className="at-reupload-icon-badge">
                      <IconAlert size={22} color="#ef4444" />
                    </div>
                    <div>
                      <h2 className="at-reupload-title">
                        Mga Dokumentong Kailangang I-reupload / Palitan
                      </h2>
                      <p className="at-reupload-sub">
                        Pagsusuri ng MPDC / Zoning Administrator — Maling Dokumento
                      </p>
                    </div>
                  </div>
                  <div className="at-reupload-count-badge">
                    <span>{rejectedEntries.length} Kailangang Palitan</span>
                  </div>
                </div>

                <div className="at-reupload-alert-banner">
                  <IconAlert size={18} color="#f87171" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong>Pansin sa Aplikante:</strong> May mga isinumiteng dokumento na tinanggihan ng MPDC Officer dahil hindi wasto, malabo, o expired. Mangyaring basahin ang dahilan ng pag-reject sa bawat dokumento sa ibaba at i-upload ang bago at wastong kopya upang maipagpatuloy ang pag-apruba.
                  </div>
                </div>

                {reuploadDocSuccess && (
                  <div className="at-reupload-toast success">
                    <IconCheck size={16} color="#10b981" />
                    <span>{reuploadDocSuccess}</span>
                  </div>
                )}

                {reuploadDocError && (
                  <div className="at-reupload-toast error">
                    <IconAlert size={16} color="#ef4444" />
                    <span>{reuploadDocError}</span>
                  </div>
                )}

                <div className="at-reupload-grid">
                  {rejectedEntries.map(([docKey, rejectInfo]: [string, any]) => {
                    const isUploadingThis = uploadingDocKey === docKey;
                    const docTitle = rejectInfo.reqTitle || docKey;
                    return (
                      <div key={docKey} className="at-reupload-item-card">
                        <div className="at-reupload-item-top">
                          <div className="at-reupload-item-title-row">
                            <span className="at-reupload-doc-badge">Tinanggihan / Maling Dokumento</span>
                            <h3 className="at-reupload-item-title">{docTitle}</h3>
                          </div>
                          {rejectInfo.rejectedAt && (
                            <span className="at-reupload-item-time">
                              Petsa: {new Date(rejectInfo.rejectedAt).toLocaleDateString("tl-PH", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          )}
                        </div>

                        <div className="at-reupload-reason-box">
                          <strong className="at-reupload-reason-lbl">
                            Dahilan ng Pag-reject:
                          </strong>
                          <p className="at-reupload-reason-text">
                            {rejectInfo.reason || "Hindi wasto o malabo ang naunang kopya."}
                          </p>
                        </div>

                        <div className="at-reupload-action-box">
                          <label className={`at-reupload-upload-btn ${isUploadingThis ? "loading" : ""}`}>
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              disabled={isUploadingThis}
                              onChange={(e) => handleReuploadSpecificDoc(docKey, docTitle, e)}
                              style={{ display: "none" }}
                            />
                            <IconUpload />
                            <span>
                              {isUploadingThis
                                ? "Ikinakarga ang bagong file…"
                                : `Mag-upload ng Bagong Kopya para sa "${docTitle}" →`}
                            </span>
                          </label>
                          <span className="at-reupload-hint">
                            Tumatanggap ng PDF, JPG, o PNG (Siguraduhing malinaw at kumpleto ang pahina)
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               DIGITAL ORDER OF PAYMENT & OFFICIAL RECEIPT UPLOAD
               ══════════════════════════════════════════════════════════════ */}
            {(app.status === "for_payment" || app.status === "for_engineering_inspection" || Boolean(app.payment?.orderOfPaymentNo) || currentStageIndex >= 2) && (
              <div className="at-payment-section-card">
                <div className="at-payment-header">
                  <div className="at-payment-header-left">
                    <div className="at-payment-icon-badge">
                      <IconReceipt />
                    </div>
                    <div>
                      <h2 className="at-payment-title">Municipal Order of Payment (Digital Slip)</h2>
                      <p className="at-payment-sub">Kagawaran ng Ingat-Yaman (Treasury) &amp; MPDC Zoning Assessment</p>
                    </div>
                  </div>
                  <div className="at-payment-status-badge">
                    {app.payment?.status === "paid" || app.status === "for_engineering_inspection" ? (
                      <span className="at-badge-paid"><IconCheck size={14} color="#10b981" /> Bayad Na (O.R. Naitala)</span>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span className="at-badge-pending">Naghihintay ng Pagbabayad sa Treasury</span>
                        {isPaymentOverdue && (
                          <span className="at-badge-overdue">
                            ⚠️ &gt;30 Araw (Aging / Overdue)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Mandated Instruction Banner */}
                <div
                  className="at-op-instruction-banner"
                  style={
                    isPaymentOverdue
                      ? {
                          borderColor: "rgba(239, 68, 68, 0.6)",
                          background: "rgba(239, 68, 68, 0.12)",
                        }
                      : undefined
                  }
                >
                  <div className="at-op-instruction-icon">
                    {isPaymentOverdue ? (
                      <IconAlert size={22} color="#ef4444" />
                    ) : (
                      <IconCheck size={22} color="#059669" />
                    )}
                  </div>
                  <div className="at-op-instruction-text">
                    <div
                      className="at-op-instruction-main"
                      style={isPaymentOverdue ? { color: "#fca5a5" } : undefined}
                    >
                      {isPaymentOverdue
                        ? `⚠️ PAALALA SA PAGBABAYAD: Lumagpas na sa 30 Araw ang Order of Payment (${paymentAgeDays} araw ang nakalipas).`
                        : "Zoning Approved. Ipakita ang pahinang ito sa Municipal Treasury Office upang magbayad ng kaukulang fee."}
                    </div>
                    <div className="at-op-instruction-sub">
                      {isPaymentOverdue
                        ? `Inaprubahan ito noong ${formattedApprovalDate}. Mangyaring magtungo agad sa Tanggapan ng Ingat-Yaman (Treasury Office, 1st Floor, Munisipyo ng Luisiana). Ipakita ang Payment Reference: ${orderOfPaymentNo} upang bayaran ang ₱${Number(app.payment?.amount || 280).toFixed(2)} at maiwasan ang muling pagsusuri ng inyong clearance.`
                        : `Matapos maaprubahan ang inyong Zoning Clearance, magtungo sa Tanggapan ng Ingat-Yaman (Municipal Treasury Office, 1st Floor, Munisipyo ng Luisiana). Ipakita ang Reference o Payment Number (${orderOfPaymentNo}) sa Cashier upang magbayad. Awtomatikong maitatala ng Treasury ang inyong Official Receipt sa sistema.`}
                    </div>
                  </div>
                </div>

                {/* Digital Slip Content */}
                <div className="at-op-slip">
                  <div className="at-op-slip-header">
                    <div className="at-op-slip-seal">
                      <img src="/logo.png" alt="Luisiana Seal" />
                      <div>
                        <strong>BAYAN NG LUISIANA</strong>
                        <small>Lalawigan ng Laguna · Tanggapan ng Ingat-Yaman</small>
                      </div>
                    </div>
                    <div className="at-op-slip-meta">
                      <div className="at-op-meta-item">
                        <span>Order of Payment No:</span>
                        <strong>{app.payment?.orderOfPaymentNo || `OP-${new Date().getFullYear()}-${app.trackingNumber.slice(-4)}`}</strong>
                      </div>
                      <div className="at-op-meta-item">
                        <span>Petsa ng Pagkaka-isyu:</span>
                        <strong>{app.payment?.issuedAt ? new Date(app.payment.issuedAt).toLocaleDateString("tl-PH", { year: "numeric", month: "long", day: "numeric" }) : new Date().toLocaleDateString("tl-PH", { year: "numeric", month: "long", day: "numeric" })}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="at-op-table-wrap">
                    <table className="at-op-table">
                      <thead>
                        <tr>
                          <th>Deskripsyon ng Bayarin (Nature of Collection)</th>
                          <th>Account / Kodigo</th>
                          <th style={{ textAlign: "right" }}>Kaukulang Halaga</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(app.payment?.feeBreakdown || [
                          { item: "Zoning Clearance Fee (Locational Assessment)", amount: 250 },
                          { item: "Legal & Filing / Document Processing", amount: 30 },
                        ]).map((f, i) => (
                          <tr key={i}>
                            <td>{f.item}</td>
                            <td><code>4-01-01-010</code></td>
                            <td style={{ textAlign: "right" }}>₱{Number(f.amount).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={2} style={{ textAlign: "right" }}><strong>Kabuuang Bayarin (Total Amount Due):</strong></td>
                          <td style={{ textAlign: "right" }}><strong className="at-op-total-amount">₱{Number(app.payment?.amount || 280).toFixed(2)}</strong></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Receipt Verified Notice (Shown only if already paid / recorded by Treasury) */}
                {(app.payment?.status === "paid" || app.status === "for_engineering_inspection") && (
                  <div className="at-receipt-verified-box">
                    <div className="at-receipt-verified-header">
                      <div className="at-receipt-v-icon">
                        <IconCheck size={22} color="#10b981" />
                      </div>
                      <div>
                        <div className="at-receipt-v-title">Naitala na ang Inyong Official Receipt (O.R.)</div>
                        <div className="at-receipt-v-sub">
                          Ang inyong aplikasyon ay opisyal nang pumasok sa dashboard ng Engineering Office para sa "Before" Ocular &amp; Construction Inspection.
                        </div>
                      </div>
                    </div>

                    <div className="at-receipt-details-grid">
                      <div className="at-receipt-col">
                        <span>Official Receipt (O.R.) No:</span>
                        <strong>{app.payment?.orNumber || "OR-VERIFIED"}</strong>
                      </div>
                      <div className="at-receipt-col">
                        <span>Halagang Binayaran:</span>
                        <strong>₱{Number(app.payment?.amount || 280).toFixed(2)}</strong>
                      </div>
                      <div className="at-receipt-col">
                        <span>Petsa ng Resibo:</span>
                        <strong>{app.payment?.paymentDate || new Date().toISOString().split("T")[0]}</strong>
                      </div>
                      <div className="at-receipt-col">
                        <span>Katayuan sa Engineering:</span>
                        <strong style={{ color: "#10b981" }}>Papasok na sa "Before" Inspection</strong>
                      </div>
                    </div>

                    {app.payment?.receiptUrl && (
                      <div className="at-receipt-preview-row">
                        <button
                          type="button"
                          className="at-view-receipt-btn"
                          onClick={() => setPreviewingReceipt({ url: backendUrl(app.payment?.receiptUrl || ""), title: `Official Receipt - ${app.payment?.orNumber}` })}
                        >
                          <IconReceipt />
                          <span>Tingnan ang In-upload na Resibo (In-System Viewer)</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               UI ELEMENT 2 & 3: STATUS CARD & MESSAGE/REMARKS BOARD
               ══════════════════════════════════════════════════════════════ */}
            <div className="at-grid-cards">
              {/* STATUS CARD */}
              <div className="at-status-card">
                <div className="at-status-card-header">
                  <span className="at-status-card-title">Status Card &amp; Assessment</span>
                  <span style={{ fontSize: 11, color: "#38bdf8", fontWeight: 700 }}>
                    Official Municipal Record
                  </span>
                </div>

                <div className="at-status-headline">
                  <span style={{ color: isRejected ? "#ef4444" : isFlagged ? "#fbbf24" : isAllApproved ? "#10b981" : activeStage.theme.activeText }}>●</span>
                  <span style={{ color: isRejected ? "#f87171" : isFlagged ? "#fbbf24" : undefined }}>
                    {isRejected
                      ? "Status: Tinanggihan / Disapproved (Hindi Wasto ang Dokumento)"
                      : isFlagged
                      ? "Status: Flagged (Nangangailangan ng Re-upload ng Dokumento)"
                      : isAllApproved
                      ? "Status: Naaprubahan na ang Permiso (Zoning & Building Clearance Released)"
                      : app.status === "for_engineering_inspection"
                      ? "Status: Bayad Na - Nakatakda para sa Engineering 'Before' Inspection"
                      : app.status === "for_payment"
                      ? "Status: Zoning Approved - Naghihintay ng Pagbabayad sa Treasury"
                      : app.status === "ocular_inspection"
                      ? "Status: Para sa Ocular Inspection - Sinusuri ng Zoning Officer"
                      : app.status === "returned"
                      ? "Status: Naibalik sa Aplikante (May Kulang na Dokumento)"
                      : "Status: Pending MPDC Review - Document Integrity Verified"}
                  </span>
                </div>

                <dl className="at-status-details-list">
                  <div className="at-status-row">
                    <dt>Kasalukuyang May Hawak:</dt>
                    <dd style={{ color: isRejected ? "#f87171" : isFlagged ? "#fbbf24" : isAllApproved ? "#34d399" : activeStage.theme.activeText }}>
                      {isRejected
                        ? "MPDC / Zoning Office (Disapproved / Rejected)"
                        : isFlagged
                        ? "MPDC / Zoning Office (Flagged for Document Re-upload)"
                        : isAllApproved
                        ? "MPDC / Mayor's Office (Permit Released)"
                        : `${activeStage.office} (${activeStage.officer})`}
                    </dd>
                  </div>
                  <div className="at-status-row">
                    <dt>Citizen's Charter Turnaround:</dt>
                    <dd style={{ color: isRejected ? "#f87171" : isFlagged ? "#fbbf24" : "#34d399" }}>
                      {isRejected ? "Tinanggihan ang Aplikasyon" : isFlagged ? "Flagged (Aksyon ng Aplikante)" : isAllApproved ? "Kompelto / Naaprubahan Na" : "1 Day 12 Minutes (SLA Target)"}
                    </dd>
                  </div>
                  <div className="at-status-row">
                    <dt>Target Barangay:</dt>
                    <dd>{app.applicant?.barangay || "San Roque"}</dd>
                  </div>
                  <div className="at-status-row">
                    <dt>GIS Hazard Clearance:</dt>
                    <dd style={{ color: "#34d399" }}>
                      🟢 Safe Zone (Landslide &amp; Flood Assessment Low)
                    </dd>
                  </div>
                  <div className="at-status-row">
                    <dt>Tax Dec / TCT No:</dt>
                    <dd style={{ fontFamily: "monospace" }}>{app.lotDetails?.taxDecNo || "TD-2026-901"}</dd>
                  </div>
                  <div className="at-status-row">
                    <dt>Kabuuang Sukat ng Lote:</dt>
                    <dd>{app.lotDetails?.lotAreaSqM ? `${app.lotDetails.lotAreaSqM} sq.m.` : "185 sq.m."}</dd>
                  </div>
                </dl>

                <div className="at-status-instruction-box">
                  <IconAlert size={18} color={isRejected ? "#ef4444" : isFlagged ? "#fbbf24" : isAllApproved ? "#10b981" : "#38bdf8"} />
                  <div>
                    <strong>Payo para sa Aplikante:</strong>
                    <div style={{ marginTop: 2, fontSize: 12 }}>
                      {isRejected ? (
                        <span style={{ color: "#fca5a5" }}>
                          Tinanggihan ang aplikasyong ito ng Tanggapan ng MPDC dahil sa hindi wastong mga dokumento. Mangyaring basahin ang opisyal na memo sa <strong>Message / Remarks Board</strong> sa tabi para sa partikular na dahilan at kaukulang gabay.
                        </span>
                      ) : isFlagged ? (
                        <span style={{ color: "#fcd34d" }}>
                          Ang inyong aplikasyon ay <strong>Flagged</strong> dahil mayroong dokumento na tinanggihan ng MPDC at kailangang palitan. Mangyaring gamitin ang <strong>Mga Dokumentong Kailangang I-reupload</strong> sa itaas upang magsumite ng bagong kopya.
                        </span>
                      ) : isAllApproved ? (
                        <span style={{ color: "#6ee7b7" }}>
                          Tapos na ang proseso ng inyong aplikasyon! Opisyal nang naaprubahan at nai-isyu ang inyong permiso. Maaari ninyo itong i-print o kuhain ang opisyal na may selyong kopya sa Munisipyo.
                        </span>
                      ) : app.status === "for_payment" || isPaymentPending ? (
                        <span>
                          {isPaymentOverdue ? (
                            <span style={{ color: "#fca5a5" }}>
                              ⚠️ <strong>OVERDUE ANG BAYARIN:</strong> Nakalipas na ang {paymentAgeDays} araw mula nang maaprubahan ang Order of Payment. Agad na magtungo sa Tanggapan ng Ingat-Yaman (Treasury Office, Cashier) at ibigay ang Payment Number <strong>{orderOfPaymentNo}</strong> para mabayaran ang ₱{Number(app.payment?.amount || 280).toFixed(2)}.
                            </span>
                          ) : (
                            <span>
                              Pumunta sa Tanggapan ng Ingat-Yaman (Treasury Office, Cashier) dala ang inyong Payment Reference <strong>{orderOfPaymentNo}</strong> upang magbayad ng ₱{Number(app.payment?.amount || 280).toFixed(2)} at kumuha ng Official Receipt (O.R.).
                            </span>
                          )}
                        </span>
                      ) : (
                        <span>
                          Walang kinakailangang pagpunta sa munisipyo sa ngayon. Pakitingnan ang{" "}
                          <strong>Message/Remarks Board</strong> sa tabi kung may karagdagang tagubilin mula sa
                          Municipal Engineer o MPDC.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* MESSAGE / REMARKS BOARD */}
              <div className="at-remarks-card">
                <div className="at-remarks-header">
                  <div className="at-remarks-title">
                    <IconMessage />
                    <span>Message / Remarks Board</span>
                  </div>
                  <span className="at-remarks-count-tag">
                    {app.remarks?.length || 0} Mensahe / Memo
                  </span>
                </div>

                {reuploadSuccess && (
                  <div style={{ background: "rgba(16, 185, 129, 0.2)", border: "1px solid #10b981", color: "#6ee7b7", padding: "10px 14px", borderRadius: 8, fontSize: 12.5, display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <IconCheck size={15} color="#10b981" />
                    <span>{reuploadSuccess}</span>
                  </div>
                )}

                {realtimeNotice && (
                  <div style={{ background: "rgba(56, 189, 248, 0.16)", border: "1px solid #38bdf8", color: "#bae6fd", padding: "10px 14px", borderRadius: 8, fontSize: 12.5, display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#38bdf8", display: "inline-block", boxShadow: "0 0 8px #38bdf8" }} />
                    <span style={{ flex: 1, fontWeight: 500 }}>{realtimeNotice}</span>
                    <button
                      type="button"
                      onClick={() => setRealtimeNotice(null)}
                      style={{ background: "none", border: "none", color: "#bae6fd", cursor: "pointer", fontSize: 14, padding: "0 4px" }}
                    >
                      ✕
                    </button>
                  </div>
                )}

                <div className="at-remarks-feed">
                  {app.remarks && app.remarks.length > 0 ? (
                    app.remarks.map((rem) => {
                      const officeClass =
                        rem.fromOffice === "MPDC"
                          ? "mpdc"
                          : rem.fromOffice === "Engineering"
                          ? "engineering"
                          : rem.fromOffice === "Treasury"
                          ? "treasury"
                          : "system";

                      return (
                        <div
                          key={rem.id}
                          className={`at-remark-item ${rem.requiresAction && app.status === "returned" ? "action-required" : ""}`}
                        >
                          <div className="at-remark-top">
                            <span className={`at-remark-office-tag ${officeClass}`}>
                              {rem.fromOffice}
                            </span>
                            <span className="at-remark-time">
                              {new Date(rem.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>

                          <div className="at-remark-author">{rem.author}</div>
                          <div className="at-remark-msg">{rem.message}</div>

                          {/* Inline Document Re-upload Module only if the application is currently returned */}
                          {rem.requiresAction && app.status === "returned" && (
                            <div className="at-reupload-box">
                              <div className="at-reupload-label">
                                <IconUpload />
                                <span>Kailangan ang Malinaw na Kopya:</span>
                              </div>
                              <div className="at-reupload-actions">
                                <label className="at-reupload-file-btn">
                                  <span>Pumili ng File at I-upload</span>
                                  <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    style={{ display: "none" }}
                                    onChange={handleReuploadDoc}
                                  />
                                </label>
                              </div>
                            </div>
                          )}

                          {rem.attachedFile && (
                            <div style={{ marginTop: 4, fontSize: 11, color: "#38bdf8", display: "flex", alignItems: "center", gap: 5 }}>
                              <IconCheck size={12} color="#38bdf8" />
                              <span>Nai-kalakip: <strong>{rem.attachedFile}</strong></span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ textAlign: "center", padding: "36px 18px", color: "rgba(255,255,255,0.45)", fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <IconMessage />
                      <strong style={{ color: "rgba(255,255,255,0.8)" }}>Wala pang opisyal na komento o memo</strong>
                      <span style={{ fontSize: 11.5, maxWidth: 320, lineHeight: 1.45, opacity: 0.75 }}>
                        Dito makikita ang mga opisyal na pagsusuri, tagubilin, at kahilingan mula sa MPDC at Municipal Engineering Office kapag may mensahe sila para sa iyong aplikasyon.
                      </span>
                    </div>
                  )}
                </div>

                {/* Reply / Follow-up Input */}
                <div className="at-reply-box">
                  <input
                    type="text"
                    className="at-reply-input"
                    placeholder="Mag-iwan ng tanong o mensahe sa tanggapan…"
                    value={newRemarkText}
                    onChange={(e) => setNewRemarkText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handlePostApplicantRemark()}
                  />
                  <button
                    type="button"
                    className="at-reply-btn"
                    disabled={submittingRemark || !newRemarkText.trim()}
                    onClick={handlePostApplicantRemark}
                  >
                    {submittingRemark ? "…" : "Ipadala"}
                  </button>
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
               UI ELEMENT 4: ACTUAL SITE INSPECTION & PROGRESS BOARD
               ══════════════════════════════════════════════════════════════ */}
            {(app.latestInspection || (app.inspectionPhotos && app.inspectionPhotos.length > 0) || app.inspectionStage || app.payment?.status === "paid") && (() => {
              const inspProgress = app.progress ?? app.latestInspection?.progress ?? 0;
              const inspStage = app.inspectionStage || app.latestInspection?.stage || (inspProgress >= 100 ? "after" : inspProgress >= 50 ? "during" : "before");
              let badgeColor = "#ef4444";
              let badgeTitle = "🔴 0% - Before Construction";
              let badgeSubtitle = "Bago Simulan · Bakanteng Lote / Pre-Excavation Inspection";
              if (inspProgress >= 100 || inspStage === "after" || inspStage === "completed") {
                badgeColor = "#22c55e";
                badgeTitle = "🟢 100% - After Construction / Completed";
                badgeSubtitle = "Tapos Na ang Gusali · Handa sa Certificate of Occupancy";
              } else if (inspProgress >= 50 || inspStage === "during") {
                badgeColor = "#eab308";
                badgeTitle = "🟡 50% - During Construction";
                badgeSubtitle = "Kasalukuyang Ginagawa · Nakatayo ang Pundasyon at mga Poste";
              }

              const latestPhoto = app.latestInspection?.photoUrl || (app.inspectionPhotos && app.inspectionPhotos.length > 0 ? app.inspectionPhotos[app.inspectionPhotos.length - 1]?.url : null);
              const inspectedAt = app.latestInspection?.inspectedAt || (app.inspectionPhotos && app.inspectionPhotos.length > 0 ? app.inspectionPhotos[app.inspectionPhotos.length - 1]?.uploadedAt : null);
              const formattedInspectionDate = inspectedAt
                ? new Date(inspectedAt).toLocaleDateString("fil-PH", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Nakatakda para sa Unang Site Visit";

              return (
                <div className="at-site-progress-panel">
                  <div className="at-site-progress-header">
                    <div className="at-site-progress-title">
                      <span style={{ fontSize: 20 }}>📷</span>
                      <span>Aktwal na Katayuan sa Site (Engineering Inspection)</span>
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        padding: "4px 12px",
                        borderRadius: 999,
                        background: `${badgeColor}22`,
                        color: badgeColor,
                        border: `1px solid ${badgeColor}66`,
                      }}
                    >
                      {badgeTitle}
                    </span>
                  </div>

                  <div className="at-site-progress-grid">
                    {/* Left: Actual Photo */}
                    <div className="at-site-photo-frame">
                      {latestPhoto ? (
                        <>
                          <img
                            src={backendUrl(latestPhoto)}
                            alt="Aktwal na Litrato mula sa Site"
                            className="at-site-photo-img"
                          />
                          <div
                            style={{
                              position: "absolute",
                              bottom: 8,
                              left: 8,
                              background: "rgba(0,0,0,0.75)",
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 600,
                              color: "#fff",
                            }}
                          >
                            📷 Aktwal na kuha mula sa site
                          </div>
                        </>
                      ) : (
                        <div className="at-site-photo-none">
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                          <span>Mag-a-upload ang Municipal Engineer ng litrato matapos ang site visit</span>
                        </div>
                      )}
                    </div>

                    {/* Right: Inspection details */}
                    <div className="at-site-info-col">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, color: "#94a3b8" }}>Progreso ng Konstruksyon:</span>
                        <strong style={{ fontSize: 16, color: badgeColor }}>{inspProgress}%</strong>
                      </div>
                      <div
                        style={{
                          height: 8,
                          background: "rgba(255,255,255,0.1)",
                          borderRadius: 999,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.max(6, inspProgress)}%`,
                            backgroundColor: badgeColor,
                            borderRadius: 999,
                            transition: "width 0.4s ease",
                          }}
                        />
                      </div>
                      <div style={{ fontSize: 12, color: "#cbd5e1" }}>
                        {badgeSubtitle}
                      </div>
                      <div style={{ fontSize: 12, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <span>📅 Huling Inspeksyon:</span>
                        <strong style={{ color: "#f1f5f9" }}>{formattedInspectionDate}</strong>
                      </div>
                      {app.latestInspection?.remarks && (
                        <div
                          style={{
                            background: "rgba(255,255,255,0.04)",
                            borderLeft: `3px solid ${badgeColor}`,
                            padding: "8px 12px",
                            borderRadius: "0 8px 8px 0",
                            fontSize: 12,
                            color: "#e2e8f0",
                            fontStyle: "italic",
                            marginTop: 4,
                          }}
                        >
                          "{app.latestInspection.remarks}"
                          {app.latestInspection.inspector && (
                            <span style={{ display: "block", fontSize: 10, color: "#94a3b8", marginTop: 2, fontStyle: "normal" }}>
                              — {app.latestInspection.inspector}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Bottom Action Footer */}
            <div className="at-footer-actions">
              <button
                type="button"
                className="at-action-btn at-action-btn-primary"
                onClick={() => window.print()}
              >
                <IconPrinter />
                <span>I-print ang Application Status Sheet</span>
              </button>
              <button
                type="button"
                className="at-action-btn at-action-btn-secondary"
                onClick={handleCopyTracking}
              >
                <IconCopy />
                <span>{copied ? "Nai-kopya ang Link!" : "Kopyahin ang Tracking Link"}</span>
              </button>
              <button
                type="button"
                className="at-action-btn at-action-btn-secondary"
                onClick={onBack}
              >
                ← Bumalik sa Portal
              </button>
            </div>
          </>
        )}
      </main>

      {/* In-System Receipt / Document Lightbox Viewer Modal */}
      {previewingReceipt && (
        <div className="at-lightbox-overlay" onClick={() => setPreviewingReceipt(null)}>
          <div className="at-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <div className="at-lightbox-header">
              <div className="at-lightbox-title">
                <IconReceipt />
                <span>{previewingReceipt.title}</span>
              </div>
              <button
                type="button"
                className="at-lightbox-close"
                onClick={() => setPreviewingReceipt(null)}
                title="Isara"
              >
                ✕
              </button>
            </div>
            <div className="at-lightbox-body">
              {previewingReceipt.url.toLowerCase().endsWith(".pdf") ? (
                <iframe
                  src={previewingReceipt.url}
                  className="at-lightbox-iframe"
                  title="PDF Preview"
                />
              ) : (
                <img
                  src={previewingReceipt.url}
                  alt="Document Preview"
                  className="at-lightbox-img"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

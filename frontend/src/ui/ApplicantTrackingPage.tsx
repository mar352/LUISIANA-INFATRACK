import { useState, useEffect, useMemo } from "react";
import { io } from "socket.io-client";
import { backendUrl, reuploadCitizenDocument, submitCitizenReceipt } from "../lib/api";
import { PdfCanvasViewer } from "./InSystemDocViewer";
import { ThemeToggle } from "./ThemeToggle";
import { useTranslation, LanguageToggle } from "./LanguageToggle";
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

const IconFileTextDoc = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const IconCamera = ({ size = 18, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const IconAward = ({ size = 22, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="8" r="7" />
    <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
  </svg>
);

const IconCalendar = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

/* ── Stepper Definition ── */
export type TrackingStage = {
  step: number;
  id: string;
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

export function getTrackingStages(isEn: boolean): TrackingStage[] {
  return [
    {
      step: 1,
      id: "mpdc_approval",
      label: isEn ? "1. MPDC Zoning Approval" : "1. Pag-apruba ng MPDC Zoning",
      office: isEn ? "MPDC & Zoning Board" : "MPDC at Lupon ng Zoning",
      officer: isEn ? "Edward B. Romulo, EnP. · Zoning Review" : "Edward B. Romulo, EnP. · Pagsusuri sa Zoning",
      theme: {
        activeBg: "#0284c7",
        activeBorder: "#38bdf8",
        activeGlow: "rgba(56, 189, 248, 0.3)",
        activeText: "#38bdf8",
      },
    },
    {
      step: 2,
      id: "client_receipt_upload",
      label: isEn ? "2. Client Uploads Receipt (O.R.)" : "2. Pag-upload ng Resibo (O.R.)",
      office: isEn ? "Applicant Portal · Proof of Payment" : "Portal ng Aplikante · Katibayan ng Bayad",
      officer: isEn ? "Direct Applicant O.R. Attachment" : "Direktang Kalakip ng O.R. ng Aplikante",
      theme: {
        activeBg: "#059669",
        activeBorder: "#10b981",
        activeGlow: "rgba(16, 185, 129, 0.35)",
        activeText: "#34d399",
      },
    },
    {
      step: 3,
      id: "engineering_inspection",
      label: isEn ? "3. Engineering Site Inspection" : "3. Engineering Site Inspection",
      office: isEn ? "Municipal Engineering Office" : "Tanggapan ng Inhinyero ng Munisipyo",
      officer: isEn ? "Engr. Mario S. Baldovino · Building Clearance & Pinning" : "Engr. Mario S. Baldovino · Building Clearance & Pinning",
      theme: {
        activeBg: "#ea580c",
        activeBorder: "#f97316",
        activeGlow: "rgba(249, 115, 22, 0.35)",
        activeText: "#fb923c",
      },
    },
  ];
}

export const TRACKING_STAGES: TrackingStage[] = getTrackingStages(true);

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
  const { language } = useTranslation();
  const isEn = language === "en";
  const stages = useMemo(() => getTrackingStages(isEn), [isEn]);

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

  // Official Receipt (O.R.) Client Upload State
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptFilePreview, setReceiptFilePreview] = useState<string | null>(null);
  const [submittingReceipt, setSubmittingReceipt] = useState(false);
  const [receiptUploadSuccess, setReceiptUploadSuccess] = useState<string | null>(null);
  const [receiptUploadError, setReceiptUploadError] = useState<string | null>(null);

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
      setError(
        isEn
          ? `No application found for Tracking Reference "${query}". Please ensure the code is typed correctly.`
          : `Walang natagpuang aplikasyon sa Tracking Reference na "${query}". Pakitiyak kung tama ang na-type.`
      );
    } catch {
      setError(
        isEn
          ? "Unable to access the tracking server at this time. Please try again."
          : "Hindi ma-access ang tracking server sa ngayon. Pakisubukang muli."
      );
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
            setRealtimeNotice(
              isEn
                ? "New official notes received from the MPDC / Zoning Office."
                : "Natanggap ang bagong opisyal na notes mula sa Tanggapan ng MPDC / Zoning."
            );
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
            setRealtimeNotice(
              isEn
                ? `New memo/notes from ${newRemark.fromOffice}: "${newRemark.message.slice(0, 60)}..."`
                : `Bagong memo/notes mula sa ${newRemark.fromOffice}: "${newRemark.message.slice(0, 60)}..."`
            );
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
  }, [app?.trackingNumber, app?.id, isEn]);

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

  // Determine current active stage in the streamlined 3-step lifecycle
  // Step 1 (Index 0): MPDC Zoning Approval
  // Step 2 (Index 1): Client Uploads Official Receipt (O.R.)
  // Step 3 (Index 2): Engineering Site Inspection
  const currentStageIndex = (() => {
    const st = (app?.status || "submitted").toLowerCase();
    const paySt = (app?.payment?.status || "").toLowerCase();
    const isPaid = paySt === "paid" || Boolean(app?.payment?.orNumber) || Boolean((app as any)?.or_number) || Boolean(app?.payment?.receiptUrl);

    // Step 3 (Index 2): Engineering Site Inspection & Pinning
    if (st.includes("engineering") || st === "for_engineering_inspection" || st === "approved_for_construction" || st === "completed" || st === "approved" || isPaid) return 2;

    // Step 2 (Index 1): Client Uploads Receipt (O.R.)
    if (st === "approved_for_payment" || st === "for_payment" || st === "for_assessment" || paySt === "order_of_payment_issued" || Boolean(app?.payment?.orderOfPaymentNo)) return 1;

    // Step 1 (Index 0): MPDC Zoning Review & Document Verification
    return 0;
  })();

  const activeStage = stages[currentStageIndex] || stages[0];

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
    ? new Date(paymentIssuedRaw).toLocaleDateString(isEn ? "en-PH" : "tl-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : (isEn ? "Current" : "Kasalukuyan");

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
      author: app.applicant?.fullName || (isEn ? "Applicant" : "Aplikante"),
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

  // Handle Direct Citizen Official Receipt (O.R.) Upload
  const handleUploadOfficialReceipt = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!app?.trackingNumber) return;
    if (!receiptFile) {
      setReceiptUploadError(
        isEn
          ? "Please select or upload a copy (photo or PDF) of your Official Receipt from the Assessor."
          : "Mangyaring pumili o mag-upload ng kopya (litrato o PDF) ng inyong Official Receipt mula sa Assessor."
      );
      return;
    }

    setSubmittingReceipt(true);
    setReceiptUploadError(null);
    setReceiptUploadSuccess(null);

    // Automatic receipt reference generation from tracking reference
    const autoOrNumber = `OR-ASSESSOR-${app.trackingNumber.replace(/^LUIS-ZC-/, "")}`;

    try {
      const res = await submitCitizenReceipt(app.trackingNumber, {
        orNumber: autoOrNumber,
        paidAt: new Date().toISOString(),
        file: receiptFile,
      });

      if (res && res.ok && res.application) {
        setApp(res.application);
        setReceiptUploadSuccess(
          isEn
            ? "Official Receipt from Assessor successfully uploaded! Recorded and automatically forwarded to the Engineering Office for Site Inspection."
            : "Matagumpay na nai-upload ang Official Receipt mula sa Assessor! Naitala na ito at awtomatikong naipasa ang inyong aplikasyon sa Tanggapan ng Inhinyero para sa Site Inspection."
        );
        setReceiptFile(null);
        setReceiptFilePreview(null);
      } else {
        setReceiptUploadError(
          isEn
            ? "Receipt submission failed. Please try again."
            : "Hindi naipasa ang resibo. Pakisubukang muli."
        );
      }
    } catch (err: any) {
      setReceiptUploadError(
        err?.message ||
          (isEn
            ? "Failed to upload receipt. Please check your connection."
            : "Nabigong i-upload ang resibo. Pakisuri ang koneksyon.")
      );
    } finally {
      setSubmittingReceipt(false);
    }
  };

  // Inline Document Re-upload action
  const handleReuploadDoc = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !app) return;

    const confirmationRemark: ApplicationRemark = {
      id: `rem-reup-${Date.now()}`,
      fromOffice: "Applicant",
      author: app.applicant?.fullName || (isEn ? "Applicant" : "Aplikante"),
      message: isEn
        ? `A new copy of the document has been uploaded: "${file.name}" in response to the Engineering Office notice.`
        : `Nai-upload na po ang bagong kopya ng dokumento: "${file.name}" bilang tugon sa paalala ng Engineering Office.`,
      createdAt: new Date().toISOString(),
      requiresAction: false,
      attachedFile: file.name,
    };

    setApp((prev) => (prev ? { ...prev, remarks: [...(prev.remarks || []), confirmationRemark] } : prev));
    setReuploadSuccess(
      isEn
        ? `"${file.name}" uploaded successfully. Forwarded to Engineering.`
        : `Matagumpay na nai-upload ang "${file.name}". Naitugon na ito sa Engineering.`
    );
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
          isEn
            ? `New copy for "${docTitle}" (${file.name}) uploaded successfully! Resubmitted to MPDC for review.`
            : `Matagumpay na nai-upload ang bagong kopya para sa "${docTitle}" (${file.name})! Naipasa na muli sa MPDC para sa pagsusuri.`
        );
        setTimeout(() => setReuploadDocSuccess(null), 7000);
      } else {
        setReuploadDocError(
          isEn ? "Document could not be saved. Please try again." : "Hindi nai-save ang dokumento. Pakisubukang muli."
        );
      }
    } catch (err: any) {
      setReuploadDocError(err?.message || (isEn ? "Failed to upload document." : "Nabigong i-upload ang dokumento."));
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
          <button type="button" className="at-back-btn" onClick={onBack} title={isEn ? "Back" : "Bumalik"}>
            <IconBack />
            <span>{isEn ? "Back" : "Bumalik"}</span>
          </button>
          <div className="at-nav-brand">
            <img src="/logo.png" alt="Luisiana Seal" />
            <div>
              <div className="at-nav-title">
                {isEn ? "Republic of the Philippines · Municipality of Luisiana" : "Republika ng Pilipinas · Bayan ng Luisiana"}
              </div>
              <div className="at-nav-sub">
                {isEn ? "MPDC Online Citizen Permit Tracking Portal" : "MPDC Online Citizen Permit Tracking Portal"}
              </div>
            </div>
          </div>
        </div>

        <div className="at-nav-right" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      <main className="at-main">
        {/* Quick Search Reference Box (Shown when an application is already active) */}
        {app && (
          <div className="at-search-card">
            <div className="at-search-title">
              <IconSearch />
              <span>{isEn ? "Track Another Application" : "Mag-track ng Ibang Aplikasyon"}</span>
            </div>
            <div className="at-search-box">
              <input
                type="text"
                className="at-search-input"
                placeholder={isEn ? "e.g. LUIS-ZC-2026-9078" : "Hal. LUIS-ZC-2026-9078"}
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
                {loading ? (isEn ? "Searching..." : "Naghahanap…") : (isEn ? "Search" : "Hanapin")}
              </button>
            </div>
          </div>
        )}

        {/* Loading Indicator */}
        {loading && !app && (
          <div className="at-loading-box">
            <div className="at-spinner" />
            <p>{isEn ? "Retrieving confidential application record…" : "Kinukuha ang kumpidensyal na talaan ng aplikasyon…"}</p>
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
              <span>{isEn ? "Protected & Confidential Record" : "Protektado at Kumpidensyal na Talaan"}</span>
            </div>

            <h2 className="at-empty-title">
              {isEn ? "Enter Your Tracking Reference Number" : "Ilagay ang Inyong Tracking Reference Number"}
            </h2>
            <p className="at-empty-desc">
              {isEn ? (
                <>
                  Pursuant to privacy regulations of the Municipality of Luisiana, personal application details are protected and cannot be displayed without a valid tracking code. Please enter your official <strong>Tracking Reference Code</strong> (e.g. <code>LUIS-ZC-2026-9078</code>) below to view its live multi-office progress.
                </>
              ) : (
                <>
                  Alinsunod sa mga patakaran sa kumpidensyalidad ng Bayan ng Luisiana, hindi awtomatikong inilalantad ang mga personal na detalye ng anumang aplikasyon nang walang wastong reference number. Mangyaring i-type sa ibaba ang inyong opisyal na <strong>Tracking Reference Code</strong> (Hal. <code>LUIS-ZC-2026-9078</code>) upang mabuksan ang live progress nito.
                </>
              )}
            </p>

            <div className="at-empty-search-box">
              <input
                type="text"
                className="at-empty-input"
                placeholder={isEn ? "Type Tracking No. (e.g. LUIS-ZC-2026-9078)" : "I-type ang Tracking No. (Hal. LUIS-ZC-2026-9078)"}
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
                {isEn ? "Track Application →" : "Subaybayan ang Aplikasyon →"}
              </button>
            </div>

            <div className="at-empty-guide-grid">
              <div className="at-empty-guide-item">
                <div className="at-empty-guide-num">1</div>
                <div>
                  <strong>{isEn ? "Where to Find the Reference?" : "Saan Makikita ang Reference?"}</strong>
                  <p>
                    {isEn
                      ? "Found on your official filing acknowledgment slip, SMS notification, or printed receipt from MPDC."
                      : "Makikita ito sa inyong official filing acknowledgment slip, SMS notification, o papel na resibo mula sa MPDC."}
                  </p>
                </div>
              </div>
              <div className="at-empty-guide-item">
                <div className="at-empty-guide-num">2</div>
                <div>
                  <strong>{isEn ? "Live Multi-Office Progress" : "Live Multi-Office Progress"}</strong>
                  <p>
                    {isEn
                      ? "Track real-time progress across MPDC Zoning Review, Receipt Upload, through Engineering Inspection."
                      : "Masusubaybayan ang real-time na progreso mula sa MPDC Zoning Review, Pag-upload ng Resibo, hanggang Engineering Inspection."}
                  </p>
                </div>
              </div>
              <div className="at-empty-guide-item">
                <div className="at-empty-guide-num">3</div>
                <div>
                  <strong>{isEn ? "Confidential & Secure" : "Kumpidensyal at Ligtas"}</strong>
                  <p>
                    {isEn
                      ? "Only the holder of the correct tracking reference can view personal documents and assessment notes."
                      : "Tanging ang may hawak ng tamang tracking reference ang maaaring makakita sa mga personal na dokumento at assessment notes."}
                  </p>
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
                  <span>● {isEn ? "Live System Tracking" : "Live System Tracking"}</span>
                  <span>·</span>
                  <span>{isEn ? "Zoning & Building Permit" : "Zoning & Building Permit"}</span>
                </div>
                <h1 className="at-hero-title">
                  {app.lotDetails?.proposedBuildingType || (isEn ? "Zoning Clearance for Construction" : "Zoning Clearance for Construction")}
                </h1>
                <div className="at-hero-applicant">
                  <strong>{isEn ? "Applicant:" : "Aplikante:"}</strong> {app.applicant?.fullName || (isEn ? "Applicant of Luisiana" : "Aplikante ng Luisiana")}
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
                    title={isEn ? "Copy Tracking Reference Number" : "Kopyahin ang Tracking Reference Number"}
                  >
                    {copied ? (isEn ? "Copied!" : "Nai-kopya!") : (isEn ? "Copy" : "Kopyahin")}
                  </button>
                </div>
                <div className="at-hero-date">
                  {isEn
                    ? `Date Submitted: ${new Date(app.createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}`
                    : `Petsa ng Pagsusumite: ${new Date(app.createdAt).toLocaleDateString("tl-PH", { year: "numeric", month: "long", day: "numeric" })}`}
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
               UI ELEMENT 1: LIVE PROGRESS TRACKER BAR (3-Stage Visual Stepper)
               ══════════════════════════════════════════════════════════════ */}
            <div className="at-stepper-card">
              <div className="at-stepper-header">
                <div className="at-stepper-title">
                  <span>{isEn ? "Application Process" : "Proseso ng Aplikasyon"}</span>
                  <span className="at-stepper-sub-badge">{isEn ? "3-Step Workflow" : "3-Hakbang na Proseso"}</span>
                </div>
                <div className="at-stepper-current-badge">
                  <span>{isEn ? "Current Stage:" : "Kasalukuyang Yugto:"}</span>
                  <strong>{isAllApproved ? (isEn ? "3. Clearance & Review Completed" : "3. Kumpleto Na ang Pagsusuri") : activeStage.label}</strong>
                </div>
              </div>

              {/* Stepper Track */}
              <div className="at-stepper-track">
                {stages.map((st, idx) => {
                  const isCompleted = isAllApproved ? true : idx < currentStageIndex;
                  const isActive = isAllApproved ? idx === 2 : idx === currentStageIndex;

                  return (
                    <div
                      key={st.id}
                      className={`at-step-item ${isCompleted ? "completed" : ""} ${isActive ? "active" : ""} ${isCompleted && idx === currentStageIndex - 1 ? "active-next" : ""}`}
                    >
                      <div className="at-step-circle">
                        {isCompleted ? <IconCheck size={18} color="#ffffff" /> : st.step}
                      </div>
                      <div className="at-step-label">{st.label}</div>
                      <div className="at-step-office">{st.office}</div>
                      <div
                        className={`at-step-status-tag ${isCompleted ? "completed" : isActive ? "active" : "upcoming"}`}
                      >
                        {isCompleted ? (isEn ? "✓ Done" : "✓ Tapos Na") : isActive ? (isEn ? "Current" : "Kasalukuyan") : (isEn ? "Next" : "Kasunod")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
               HAKBANG 2: CLIENT UPLOADS OFFICIAL RECEIPT (O.R.) MULA SA ASSESSOR
               ══════════════════════════════════════════════════════════════ */}
            {/* Case A: Receipt Not Yet Uploaded & MPDC Has Approved (Stage 2 Active) */}
            {(currentStageIndex === 1 || app.status === "approved_for_payment" || app.status === "for_payment" || app.status === "for_assessment") && !app.payment?.orNumber && !app.payment?.receiptUrl && (
              <div className="at-receipt-upload-card">
                <div className="at-receipt-upload-header">
                  <div className="at-receipt-upload-header-left">
                    <div className="at-receipt-icon-badge">
                      <IconReceipt />
                    </div>
                    <div className="at-receipt-header-titles">
                      <div className="at-receipt-step-tag">
                        {isEn ? "Step 2: Receipt Upload from Assessor" : "Hakbang 2: Pag-upload ng Resibo mula sa Assessor"}
                      </div>
                      <h2 className="at-receipt-card-title">
                        {isEn ? "Upload Official Receipt (O.R.) from Assessor" : "I-upload ang Opisyal na Resibo (O.R.) mula sa Assessor"}
                      </h2>
                    </div>
                  </div>

                  <div className="at-receipt-step-pill">
                    <span>{isEn ? "Awaiting Receipt" : "Naghihintay ng Resibo"}</span>
                  </div>
                </div>

                <div className="at-receipt-desc-box">
                  <p className="at-receipt-desc-lead">
                    {isEn ? (
                      <>
                        Your zoning clearance has been approved by the <strong>MPDC Zoning Officer</strong>. After receiving your <strong>Official Receipt (O.R.)</strong> from the Assessor / Municipal Treasury, attach a photo or copy here to automatically route your application to the <strong>Municipal Engineering Office</strong> for Site Inspection.
                      </>
                    ) : (
                      <>
                        Naaprubahan na ng <strong>MPDC Zoning Officer</strong> ang inyong zoning clearance. Matapos matanggap ang inyong <strong>Opisyal na Resibo (Official Receipt / O.R.)</strong> mula sa Tanggapan ng Assessor / Munisipyo, i-attach lamang dito ang litrato o kopya nito upang awtomatikong mag-proceed ang aplikasyon sa <strong>Tanggapan ng Inhinyero (Engineering Office)</strong> para sa Site Inspection.
                      </>
                    )}
                  </p>
                  <div className="at-receipt-desc-endorse">
                    <IconCheck size={16} color="currentColor" />
                    <span>
                      {isEn ? (
                        <><strong>Direct Routing:</strong> Once your receipt is uploaded, your application immediately reaches the Engineering Office for Pre-Construction Site Inspection and Coordinate Pinning.</>
                      ) : (
                        <><strong>Direktang Pag-endorso:</strong> Pagka-upload ng inyong resibo mula sa Assessor, awtomatikong darating ang inyong aplikasyon sa Tanggapan ng Inhinyero para sa Pre-Construction Site Inspection at Coordinate Pinning.</>
                      )}
                    </span>
                  </div>
                </div>

                {receiptUploadSuccess && (
                  <div className="at-reupload-toast success">
                    <IconCheck size={16} color="#10b981" />
                    <span>{receiptUploadSuccess}</span>
                  </div>
                )}

                {receiptUploadError && (
                  <div className="at-reupload-toast error">
                    <IconAlert size={16} color="#ef4444" />
                    <span>{receiptUploadError}</span>
                  </div>
                )}

                <form onSubmit={handleUploadOfficialReceipt} className="at-receipt-form">
                  {/* Dropzone / File Picker (Direct receipt upload - no manual typing required) */}
                  <div className="at-receipt-field">
                    <label className="at-receipt-dropzone">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            setReceiptFile(f);
                            setReceiptFilePreview(f.name);
                            setReceiptUploadError(null);
                          }
                        }}
                      />
                      <div className="at-receipt-dropzone-icon">
                        <IconUpload />
                      </div>
                      <div className="at-receipt-dropzone-title">
                        {receiptFile
                          ? (isEn ? "Change Selected Receipt" : "Palitan ang Napiling Resibo")
                          : (isEn ? "Click to select or drag photo/PDF of Receipt from Assessor" : "I-click para pumili o i-drag ang Litrato o PDF ng Resibo mula sa Assessor")}
                      </div>
                      <div className="at-receipt-dropzone-subtitle">
                        {isEn
                          ? "Accepts clear photo of receipt or scanned PDF (Up to 15MB)"
                          : "Tumatanggap ng malinaw na litrato ng resibo o scanned PDF (Hanggang 15MB)"}
                      </div>
                    </label>

                    {receiptFile && (
                      <div className="at-receipt-preview-chip">
                        <div className="at-receipt-preview-chip-info">
                          <span className="at-receipt-preview-file-icon">
                            <IconFileTextDoc size={14} color="currentColor" />
                          </span>
                          <div>
                            <strong className="at-receipt-preview-name">{receiptFile.name}</strong>
                            <div className="at-receipt-preview-size">
                              {(receiptFile.size / 1024).toFixed(1)} KB · {isEn ? "Ready to upload" : "Handa nang i-upload"}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="at-receipt-preview-remove-btn"
                          onClick={() => {
                            setReceiptFile(null);
                            setReceiptFilePreview(null);
                          }}
                        >
                          {isEn ? "Remove" : "Alisin"}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="at-receipt-submit-row">
                    <button
                      type="submit"
                      className="at-receipt-submit-btn"
                      disabled={submittingReceipt || !receiptFile}
                    >
                      {submittingReceipt
                        ? (isEn ? "Uploading Receipt…" : "Ina-upload ang Resibo…")
                        : (isEn ? "Submit Receipt (Proceed to Engineering) →" : "I-sumite ang Resibo (Mag-proceed sa Engineering) →")}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Case B: Receipt Already Uploaded and Verified (Stage 3 Active or Engineering Stage) */}
            {(Boolean(app.payment?.orNumber) || Boolean(app.payment?.receiptUrl) || app.status === "for_engineering_inspection" || currentStageIndex === 2) && (
              <div className="at-receipt-verified-card">
                <div className="at-receipt-verified-head">
                  <div className="at-receipt-verified-badge">
                    <IconCheck size={20} color="#15803d" />
                    <span>{isEn ? "Official Receipt from Assessor: Uploaded" : "Opisyal na Resibo mula sa Assessor: Na-upload Na"}</span>
                  </div>
                  <span className="at-receipt-verified-step-tag">
                    {isEn ? "Step 2 Completed ✓" : "Hakbang 2 Tapos Na ✓"}
                  </span>
                </div>

                <div className="at-receipt-verified-grid">
                  <div className="at-receipt-verified-col">
                    <span className="at-receipt-verified-col-label">{isEn ? "Receipt Reference" : "Reperensya ng Resibo"}</span>
                    <strong className="at-receipt-verified-col-val mono">
                      {app.payment?.orNumber || "OR-VERIFIED"}
                    </strong>
                  </div>
                  <div className="at-receipt-verified-col">
                    <span className="at-receipt-verified-col-label">{isEn ? "Status" : "Katayuan"}</span>
                    <strong className="at-receipt-verified-col-val safe">
                      {isEn ? "Recorded from Assessor" : "Nai-record mula sa Assessor"}
                    </strong>
                  </div>
                  <div className="at-receipt-verified-col">
                    <span className="at-receipt-verified-col-label">{isEn ? "Upload Date" : "Petsa ng Pag-upload"}</span>
                    <strong className="at-receipt-verified-col-val">
                      {app.payment?.paidAt
                        ? new Date(app.payment.paidAt).toLocaleDateString(isEn ? "en-PH" : "tl-PH", { year: "numeric", month: "short", day: "numeric" })
                        : (isEn ? "Verified" : "Naberipika")}
                    </strong>
                  </div>
                </div>

                <div className="at-receipt-verified-footer">
                  <p className="at-receipt-verified-notice">
                    {isEn ? (
                      <>The receipt from the Assessor has been recorded. Your application has proceeded directly to the <strong>Municipal Engineering Office</strong> for Pre-Construction Site Inspection and Geo-pinning.</>
                    ) : (
                      <>Nai-upload na ang resibo mula sa Assessor. Direkta nang pumasok ang inyong aplikasyon sa <strong>Tanggapan ng Inhinyero (Municipal Engineering Office)</strong> para sa Pre-Construction Site Inspection at Geo-pinning.</>
                    )}
                  </p>
                  {app.payment?.receiptUrl && (
                    <button
                      type="button"
                      className="at-receipt-view-btn"
                      onClick={() => setPreviewingReceipt({ url: app.payment!.receiptUrl!, title: `Official Receipt #${app.payment?.orNumber || "O.R."}` })}
                    >
                      <IconReceipt />
                      <span>{isEn ? "View Receipt" : "Tingnan ang Resibo"}</span>
                    </button>
                  )}
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
                        {isEn ? "Documents Requiring Re-upload / Replacement" : "Mga Dokumentong Kailangang I-reupload / Palitan"}
                      </h2>
                      <p className="at-reupload-sub">
                        {isEn ? "MPDC / Zoning Administrator Evaluation — Document Correction" : "Pagsusuri ng MPDC / Zoning Administrator — Maling Dokumento"}
                      </p>
                    </div>
                  </div>
                  <div className="at-reupload-count-badge">
                    <span>{isEn ? `${rejectedEntries.length} Required to Replace` : `${rejectedEntries.length} Kailangang Palitan`}</span>
                  </div>
                </div>

                <div className="at-reupload-alert-banner">
                  <IconAlert size={18} color="#f87171" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong>{isEn ? "Notice to Applicant:" : "Pansin sa Aplikante:"}</strong>{" "}
                    {isEn
                      ? "Certain submitted documents were rejected by the MPDC Officer because they were invalid, illegible, or expired. Please check the reason for rejection for each document below and upload a clear, valid copy to continue approval."
                      : "May mga isinumiteng dokumento na tinanggihan ng MPDC Officer dahil hindi wasto, malabo, o expired. Mangyaring basahin ang dahilan ng pag-reject sa bawat dokumento sa ibaba at i-upload ang bago at wastong kopya upang maipagpatuloy ang pag-apruba."}
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
                            <span className="at-reupload-doc-badge">{isEn ? "Rejected / Incorrect Document" : "Tinanggihan / Maling Dokumento"}</span>
                            <h3 className="at-reupload-item-title">{docTitle}</h3>
                          </div>
                          {rejectInfo.rejectedAt && (
                            <span className="at-reupload-item-time">
                              {isEn
                                ? `Date: ${new Date(rejectInfo.rejectedAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`
                                : `Petsa: ${new Date(rejectInfo.rejectedAt).toLocaleDateString("tl-PH", { month: "short", day: "numeric" })}`}
                            </span>
                          )}
                        </div>

                        <div className="at-reupload-reason-box">
                          <strong className="at-reupload-reason-lbl">
                            {isEn ? "Reason for Rejection:" : "Dahilan ng Pag-reject:"}
                          </strong>
                          <p className="at-reupload-reason-text">
                            {rejectInfo.reason || (isEn ? "The previous copy was invalid or illegible." : "Hindi wasto o malabo ang naunang kopya.")}
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
                                ? (isEn ? "Uploading new file…" : "Ikinakarga ang bagong file…")
                                : (isEn ? `Upload New Copy for "${docTitle}" →` : `Mag-upload ng Bagong Kopya para sa "${docTitle}" →`)}
                            </span>
                          </label>
                          <span className="at-reupload-hint">
                            {isEn
                              ? "Accepts PDF, JPG, or PNG (Ensure page is clear and complete)"
                              : "Tumatanggap ng PDF, JPG, o PNG (Siguraduhing malinaw at kumpleto ang pahina)"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}


            {/* ══════════════════════════════════════════════════════════════
               UI ELEMENT 2 & 3: STATUS CARD & MESSAGE/REMARKS BOARD
               ══════════════════════════════════════════════════════════════ */}
            <div className="at-grid-cards">
              {/* STATUS CARD */}
              <div className="at-status-card">
                <div className="at-status-card-header">
                  <span className="at-status-card-title">{isEn ? "Status Card & Assessment" : "Status Card & Assessment"}</span>
                  <span style={{ fontSize: 11, color: "#38bdf8", fontWeight: 700 }}>
                    {isEn ? "Official Municipal Record" : "Opisyal na Talaan ng Munisipyo"}
                  </span>
                </div>

                <div className="at-status-headline">
                  <span style={{ color: isRejected ? "#ef4444" : isFlagged ? "#fbbf24" : isAllApproved ? "#10b981" : activeStage.theme.activeText }}>●</span>
                  <span style={{ color: isRejected ? "#f87171" : isFlagged ? "#fbbf24" : undefined }}>
                    {isRejected
                      ? (isEn ? "Status: Disapproved / Rejected (Invalid Document)" : "Status: Tinanggihan / Disapproved (Hindi Wasto ang Dokumento)")
                      : isFlagged
                      ? (isEn ? "Status: Flagged (Document Re-upload Required)" : "Status: Flagged (Nangangailangan ng Re-upload ng Dokumento)")
                      : isAllApproved
                      ? (isEn ? "Status: Permit Approved (Zoning Clearance & Occupancy Ready)" : "Status: Naaprubahan na ang Permiso (Zoning Clearance & Occupancy Ready)")
                      : app.status === "for_engineering_inspection"
                      ? (isEn ? "Status: Paid - Scheduled for Engineering Site Inspection (0% · 50% · 100%)" : "Status: Bayad Na - Nakatakda para sa Engineering Site Inspection (0% · 50% · 100%)")
                      : app.status === "for_payment"
                      ? (isEn ? "Status: Approved by MPDC - Ready for Receipt Upload" : "Status: Inaprubahan ng MPDC - Handa para sa Pag-upload ng Resibo")
                      : app.status === "approved_for_payment" || app.status === "for_payment"
                      ? (isEn ? "Status: Approved by MPDC - Awaiting Official Receipt (O.R.) Upload" : "Status: Inaprubahan ng MPDC - Naghihintay ng Pag-upload ng Official Receipt (O.R.)")
                      : app.status === "ocular_inspection"
                      ? (isEn ? "Status: For Ocular Inspection - Under Zoning Review" : "Status: Para sa Ocular Inspection - Sinusuri ng Zoning Officer")
                      : app.status === "returned"
                      ? (isEn ? "Status: Returned to Applicant (Deficient Documents)" : "Status: Naibalik sa Aplikante (May Kulang na Dokumento)")
                      : (isEn ? "Status: Pending MPDC Review - Document Integrity & Zoning Verified" : "Status: Pending MPDC Review - Document Integrity & Zoning Verified")}
                  </span>
                </div>

                <dl className="at-status-details-list">
                  <div className="at-status-row">
                    <dt>{isEn ? "Current Office / Officer:" : "Kasalukuyang May Hawak:"}</dt>
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
                    <dt>{isEn ? "Citizen's Charter Turnaround:" : "Citizen's Charter Turnaround:"}</dt>
                    <dd style={{ color: isRejected ? "#f87171" : isFlagged ? "#fbbf24" : "#34d399" }}>
                      {isRejected
                        ? (isEn ? "Application Disapproved" : "Tinanggihan ang Aplikasyon")
                        : isFlagged
                        ? (isEn ? "Flagged (Applicant Action Required)" : "Flagged (Aksyon ng Aplikante)")
                        : isAllApproved
                        ? (isEn ? "Completed / Approved" : "Kompelto / Naaprubahan Na")
                        : "1 Day 12 Minutes (SLA Target)"}
                    </dd>
                  </div>
                  <div className="at-status-row">
                    <dt>{isEn ? "Target Barangay:" : "Target Barangay:"}</dt>
                    <dd>{app.applicant?.barangay || "San Roque"}</dd>
                  </div>
                  <div className="at-status-row">
                    <dt>{isEn ? "GIS Hazard Clearance:" : "GIS Hazard Clearance:"}</dt>
                    <dd style={{ color: "#34d399" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <IconCheck size={14} color="#34d399" />
                        <span>{isEn ? "Safe Zone (Landslide & Flood Assessment Low)" : "Ligtas na Sona (Landslide & Flood Assessment Mababa)"}</span>
                      </span>
                    </dd>
                  </div>
                  <div className="at-status-row">
                    <dt>{isEn ? "Tax Dec / TCT No:" : "Tax Dec / TCT No:"}</dt>
                    <dd style={{ fontFamily: "monospace" }}>{app.lotDetails?.taxDecNo || "TD-2026-901"}</dd>
                  </div>
                  <div className="at-status-row">
                    <dt>{isEn ? "Total Lot Area:" : "Kabuuang Sukat ng Lote:"}</dt>
                    <dd>{app.lotDetails?.lotAreaSqM ? `${app.lotDetails.lotAreaSqM} sq.m.` : "185 sq.m."}</dd>
                  </div>
                </dl>

                <div className="at-status-instruction-box">
                  <IconAlert size={18} color={isRejected ? "#ef4444" : isFlagged ? "#fbbf24" : isAllApproved ? "#10b981" : "#38bdf8"} />
                  <div>
                    <strong>{isEn ? "Advice for Applicant:" : "Payo para sa Aplikante:"}</strong>
                    <div style={{ marginTop: 2, fontSize: 12 }}>
                      {isRejected ? (
                        <span style={{ color: "#fca5a5" }}>
                          {isEn
                            ? "This application was disapproved by the MPDC Office due to invalid or deficient documents. Please consult the official memo on the Message / Remarks Board for specific guidance."
                            : "Tinanggihan ang aplikasyong ito ng Tanggapan ng MPDC dahil sa hindi wastong mga dokumento. Mangyaring basahin ang opisyal na memo sa Message / Remarks Board sa tabi para sa partikular na dahilan at kaukulang gabay."}
                        </span>
                      ) : isFlagged ? (
                        <span style={{ color: "#fcd34d" }}>
                          {isEn
                            ? "Your application is Flagged because one or more documents were rejected by MPDC. Please use the Documents Requiring Re-upload section above to upload revised copies."
                            : "Ang inyong aplikasyon ay Flagged dahil mayroong dokumento na tinanggihan ng MPDC at kailangang palitan. Mangyaring gamitin ang Mga Dokumentong Kailangang I-reupload sa itaas upang magsumite ng bagong kopya."}
                        </span>
                      ) : isAllApproved ? (
                        <span style={{ color: "#6ee7b7" }}>
                          {isEn
                            ? "Your application process is complete! Your permit has been officially approved and issued. You may print your summary sheet or collect your official stamped copy at the Municipal Hall."
                            : "Tapos na ang proseso ng inyong aplikasyon! Opisyal nang naaprubahan at nai-isyu ang inyong permiso. Maaari ninyo itong i-print o kuhain ang opisyal na may selyong kopya sa Munisipyo."}
                        </span>
                      ) : app.status === "for_payment" || isPaymentPending ? (
                        <span>
                          {isPaymentOverdue ? (
                            <span style={{ color: "#fca5a5" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#ef4444", fontWeight: 700 }}>
                                <IconAlert size={14} color="#ef4444" />
                                {isEn ? "OVERDUE PAYMENT:" : "OVERDUE ANG BAYARIN:"}
                              </span>{" "}
                              {isEn
                                ? `Over ${paymentAgeDays} days have passed since the Order of Payment was issued. Please proceed immediately to the Municipal Treasury Office (Cashier) with Payment Number ${orderOfPaymentNo} to settle ₱${Number(app.payment?.amount || 280).toFixed(2)}.`
                                : `Nakalipas na ang ${paymentAgeDays} araw mula nang maaprubahan ang Order of Payment. Agad na magtungo sa Tanggapan ng Ingat-Yaman (Treasury Office, Cashier) at ibigay ang Payment Number ${orderOfPaymentNo} para mabayaran ang ₱${Number(app.payment?.amount || 280).toFixed(2)}.`}
                            </span>
                          ) : (
                            <span>
                              {isEn
                                ? `MPDC has approved your Zoning Clearance! Please pay the standard fee of ₱${Number(app.payment?.amount || 280).toFixed(2)} and upload your Official Receipt (O.R.) in the form above to route directly to the Engineering Office.`
                                : `Inaprubahan na ng MPDC ang inyong Zoning Clearance! Mangyaring bayaran ang standard fee na ₱${Number(app.payment?.amount || 280).toFixed(2)} at i-upload ang inyong Official Receipt (O.R.) sa form sa itaas upang dumiretso ang aplikasyon sa Tanggapan ng Inhinyero.`}
                            </span>
                          )}
                        </span>
                      ) : app.status === "for_assessment" || currentStageIndex === 1 ? (
                        <span>
                          {isEn
                            ? "MPDC has approved your Zoning Clearance! Please upload your Official Receipt (O.R.) in the form above to proceed to the Engineering Office for site inspection."
                            : "Inaprubahan ng MPDC ang inyong Zoning Clearance! Mangyaring i-upload ang inyong Official Receipt (O.R.) sa form sa itaas upang dumiretso ang aplikasyon sa Tanggapan ng Inhinyero para sa site inspection."}
                        </span>
                      ) : (
                        <span>
                          {isEn ? (
                            <>No municipal hall visit is required at this time. Please check the <strong>Message / Remarks Board</strong> for any updates from the municipal offices.</>
                          ) : (
                            <>Walang kinakailangang pagpunta sa munisipyo sa ngayon. Pakitingnan ang <strong>Message/Remarks Board</strong> sa tabi kung may karagdagang tagubilin mula sa munisipyo.</>
                          )}
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
                    <span>{isEn ? "Message / Remarks Board" : "Message / Remarks Board"}</span>
                  </div>
                  <span className="at-remarks-count-tag">
                    {isEn ? `${app.remarks?.length || 0} Messages / Memos` : `${app.remarks?.length || 0} Mensahe / Memo`}
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
                                <span>{isEn ? "Clear Copy Required:" : "Kailangan ang Malinaw na Kopya:"}</span>
                              </div>
                              <div className="at-reupload-actions">
                                <label className="at-reupload-file-btn">
                                  <span>{isEn ? "Select File & Upload" : "Pumili ng File at I-upload"}</span>
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
                              <span>{isEn ? "Attached:" : "Nai-kalakip:"} <strong>{rem.attachedFile}</strong></span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ textAlign: "center", padding: "36px 18px", color: "rgba(255,255,255,0.45)", fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <IconMessage />
                      <strong style={{ color: "rgba(255,255,255,0.8)" }}>{isEn ? "No official comments or memos yet" : "Wala pang opisyal na komento o memo"}</strong>
                      <span style={{ fontSize: 11.5, maxWidth: 320, lineHeight: 1.45, opacity: 0.75 }}>
                        {isEn
                          ? "Official evaluations, instructions, and inquiries from MPDC and the Municipal Engineering Office will appear here."
                          : "Dito makikita ang mga opisyal na pagsusuri, tagubilin, at kahilingan mula sa MPDC at Municipal Engineering Office kapag may mensahe sila para sa iyong aplikasyon."}
                      </span>
                    </div>
                  )}
                </div>

                {/* Reply / Follow-up Input */}
                <div className="at-reply-box">
                  <input
                    type="text"
                    className="at-reply-input"
                    placeholder={isEn ? "Leave an inquiry or note for the office…" : "Mag-iwan ng tanong o mensahe sa tanggapan…"}
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
                    {submittingRemark ? "…" : (isEn ? "Send" : "Ipadala")}
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
              let badgeTitle = isEn ? "0% - Before Construction" : "0% - Bago Simulan ang Konstruksyon";
              let badgeSubtitle = isEn ? "Vacant Lot / Pre-Excavation Inspection" : "Bago Simulan · Bakanteng Lote / Pre-Excavation Inspection";
              if (inspProgress >= 100 || inspStage === "after" || inspStage === "completed") {
                badgeColor = "#22c55e";
                badgeTitle = isEn ? "100% - After Construction / Completed" : "100% - Tapos Na ang Gusali / Kumpleto";
                badgeSubtitle = isEn ? "Structure Completed · Ready for Certificate of Occupancy" : "Tapos Na ang Gusali · Handa sa Certificate of Occupancy";
              } else if (inspProgress >= 50 || inspStage === "during") {
                badgeColor = "#eab308";
                badgeTitle = isEn ? "50% - During Construction" : "50% - Kasalukuyang Ginagawa";
                badgeSubtitle = isEn ? "Under Construction · Foundation & Structural Columns Erected" : "Kasalukuyang Ginagawa · Nakatayo ang Pundasyon at mga Poste";
              }

              const latestPhoto = app.latestInspection?.photoUrl || (app.inspectionPhotos && app.inspectionPhotos.length > 0 ? app.inspectionPhotos[app.inspectionPhotos.length - 1]?.url : null);
              const inspectedAt = app.latestInspection?.inspectedAt || (app.inspectionPhotos && app.inspectionPhotos.length > 0 ? app.inspectionPhotos[app.inspectionPhotos.length - 1]?.uploadedAt : null);
              const formattedInspectionDate = inspectedAt
                ? new Date(inspectedAt).toLocaleDateString(isEn ? "en-PH" : "fil-PH", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : (isEn ? "Scheduled for Initial Site Visit" : "Nakatakda para sa Unang Site Visit");

              return (
                <div className="at-site-progress-panel">
                  <div className="at-site-progress-header">
                    <div className="at-site-progress-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <IconCamera size={20} color="var(--apple-accent, #38bdf8)" />
                      <span>{isEn ? "Actual Site Status (Engineering Inspection)" : "Aktwal na Katayuan sa Site (Engineering Inspection)"}</span>
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
                            alt={isEn ? "Actual Photo from Site" : "Aktwal na Litrato mula sa Site"}
                            className="at-site-photo-img"
                          />
                          <div
                            style={{
                              position: "absolute",
                              bottom: 8,
                              left: 8,
                              background: "rgba(0,0,0,0.75)",
                              padding: "3px 8px",
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 600,
                              color: "#fff",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                            }}
                          >
                            <IconCamera size={12} color="#fff" />
                            <span>{isEn ? "Actual photo from site" : "Aktwal na kuha mula sa site"}</span>
                          </div>
                        </>
                      ) : (
                        <div className="at-site-photo-none">
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                          <span>{isEn ? "Municipal Engineer will upload photo after site visit" : "Mag-a-upload ang Municipal Engineer ng litrato matapos ang site visit"}</span>
                        </div>
                      )}
                    </div>

                    {/* Right: Inspection details */}
                    <div className="at-site-info-col">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, color: "#94a3b8" }}>{isEn ? "Construction Progress:" : "Progreso ng Konstruksyon:"}</span>
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
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <IconCalendar size={13} color="#94a3b8" />
                          <span>{isEn ? "Latest Inspection:" : "Huling Inspeksyon:"}</span>
                        </span>
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

            {/* ══════════════════════════════════════════════════════════════
               STAGE 5: OCCUPANCY PERMIT & POST-CONSTRUCTION TAX DECLARATION
               ══════════════════════════════════════════════════════════════ */}
            {(app.occupancyReady || (Number(app.progress) >= 100) || currentStageIndex === 4 || Boolean(app.occupancyPermitNo)) && (
              <div
                style={{
                  background: "linear-gradient(135deg, rgba(22, 163, 74, 0.12) 0%, rgba(5, 150, 105, 0.18) 100%)",
                  border: "1.5px solid rgba(34, 197, 94, 0.5)",
                  borderRadius: "14px",
                  padding: "22px 24px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  boxShadow: "0 8px 30px rgba(34, 197, 94, 0.18)",
                  marginTop: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "10px",
                        background: "rgba(34, 197, 94, 0.25)",
                        border: "1px solid #22c55e",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        color: "#22c55e",
                      }}
                    >
                      <IconAward size={22} color="#22c55e" />
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
                          background: "#dcfce7",
                          color: "#15803d",
                          border: "1px solid #22c55e",
                        }}
                      >
                        {isEn ? "✓ Stage 5: Final Permit Phase" : "✓ Yugto 5: Pinal na Yugto ng Permiso"}
                      </div>
                      <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#fff", margin: "6px 0 0", lineHeight: 1.3 }}>
                        {isEn
                          ? "100% Construction Completed — Certificate of Occupancy & New Tax Dec"
                          : "100% Tapos Na ang Konstruksyon — Certificate of Occupancy & Bagong Tax Dec"}
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
                      Occupancy Permit No.
                    </div>
                    <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#4ade80", fontFamily: "monospace" }}>
                      {app.occupancyPermitNo || `OCC-${new Date().getFullYear()}-${app.trackingNumber.slice(-4)}`}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: "14px",
                  }}
                >
                  <div
                    style={{
                      background: "rgba(15, 23, 42, 0.6)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "10px",
                      padding: "16px",
                    }}
                  >
                    <div style={{ fontSize: "0.8rem", color: "rgba(255, 255, 255, 0.6)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                      {isEn ? "1. Certificate of Occupancy" : "1. Sertipiko ng Paggamit (Certificate of Occupancy)"}
                    </div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>
                      {isEn ? "Structure Officially Safe and Ready for Use" : "Opisyal nang Ligtas at Handa nang Gamitin ang Gusali"}
                    </div>
                    <p style={{ fontSize: "0.85rem", color: "rgba(255, 255, 255, 0.8)", margin: 0, lineHeight: 1.5 }}>
                      {isEn
                        ? "Verified by the Municipal Engineering Office at 100% inspection that the structure was built in accordance with approved building plans and the National Building Code (PD 1096)."
                        : "Napatunayan ng Municipal Engineering Office sa 100% inspection na naitayo ang gusali alinsunod sa inaprubahang building plans at National Building Code (PD 1096)."}
                    </p>
                  </div>

                  <div
                    style={{
                      background: "rgba(15, 23, 42, 0.6)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "10px",
                      padding: "16px",
                    }}
                  >
                    <div style={{ fontSize: "0.8rem", color: "rgba(255, 255, 255, 0.6)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                      {isEn ? "2. Post-Construction Assessor Assessment (Real Property Tax)" : "2. Post-Construction Assessor Assessment (Amilyar)"}
                    </div>
                    {app.assessorPostAssessment?.newTaxDecNo || (app as any).newTaxDecNo ? (
                      <div>
                        <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#38bdf8", marginBottom: 4 }}>
                          {isEn ? "New Tax Declaration:" : "Bagong Tax Declaration:"} {app.assessorPostAssessment?.newTaxDecNo || (app as any).newTaxDecNo}
                        </div>
                        <p style={{ fontSize: "0.85rem", color: "rgba(255, 255, 255, 0.8)", margin: 0, lineHeight: 1.5 }}>
                          {isEn
                            ? <>Assessed by the Municipal Assessor's Office. Ready for Real Property Tax assessment next year. PIN: <code>{app.assessorPostAssessment?.propertyIndexNo || (app as any).propertyIndexNo || "028-15-001-02"}</code></>
                            : <>Nai-assess na ng Municipal Assessor's Office ang bagong improvement. Handa na ito para sa pagbabayad ng Amilyar sa susunod na taon. PIN: <code>{app.assessorPostAssessment?.propertyIndexNo || (app as any).propertyIndexNo || "028-15-001-02"}</code></>}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fbbf24", marginBottom: 4 }}>
                          {isEn ? "Endorsed to Municipal Assessor's Office" : "Nai-endorso sa Municipal Assessor's Office"}
                        </div>
                        <p style={{ fontSize: "0.85rem", color: "rgba(255, 255, 255, 0.8)", margin: 0, lineHeight: 1.5 }}>
                          {isEn
                            ? "Automatically entered into the Assessor Registry to generate a new Tax Declaration for the upcoming tax year (Amilyar)."
                            : "Awtomatikong pumasok sa Talaan ng Assessor ang bagong gusali upang gawan ng bagong Tax Declaration para sa susunod na taon ng buwis (Amilyar)."}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Action Footer */}
            <div className="at-footer-actions">
              <button
                type="button"
                className="at-action-btn at-action-btn-primary"
                onClick={() => window.print()}
              >
                <IconPrinter />
                <span>{isEn ? "Print Application Status Sheet" : "I-print ang Application Status Sheet"}</span>
              </button>
              <button
                type="button"
                className="at-action-btn at-action-btn-secondary"
                onClick={handleCopyTracking}
              >
                <IconCopy />
                <span>{copied ? (isEn ? "Link Copied!" : "Nai-kopya ang Link!") : (isEn ? "Copy Tracking Link" : "Kopyahin ang Tracking Link")}</span>
              </button>
              <button
                type="button"
                className="at-action-btn at-action-btn-secondary"
                onClick={onBack}
              >
                {isEn ? "← Back to Portal" : "← Bumalik sa Portal"}
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
                <div
                  className="at-lightbox-canvas-wrapper"
                  style={{
                    width: "100%",
                    maxWidth: 880,
                    maxHeight: "80vh",
                    overflow: "auto",
                    display: "flex",
                    justifyContent: "center",
                    background: "rgba(0, 0, 0, 0.4)",
                    borderRadius: 8,
                    padding: "16px 8px",
                  }}
                >
                  <PdfCanvasViewer
                    url={backendUrl(previewingReceipt.url)}
                    title={previewingReceipt.title || "Resibo ng Pagbabayad"}
                    fileName={previewingReceipt.title || "Official_Receipt.pdf"}
                  />
                </div>
              ) : (
                <img
                  src={backendUrl(previewingReceipt.url)}
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

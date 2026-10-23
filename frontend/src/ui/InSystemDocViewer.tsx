import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "../lib/i18n";
import "./InSystemDocViewer.css";

export interface PreviewMedia {
  url: string;
  title: string;
  fileName?: string;
  isPdf?: boolean;
  isImg?: boolean;
  size?: number;
}

export function formatFileSize(size?: number | string): string {
  if (typeof size === "number") {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }
  return typeof size === "string" ? size : "";
}

export function isImageFile(url: string, originalName?: string): boolean {
  if (url?.startsWith("data:image/")) return true;
  const name = (originalName || url || "").toLowerCase();
  return /\.(jpg|jpeg|png|webp|gif|svg)($|\?)/i.test(name);
}

export function isPdfFile(url: string, originalName?: string): boolean {
  if (url?.startsWith("data:application/pdf")) return true;
  const name = (originalName || url || "").toLowerCase();
  return /\.pdf($|\?)/i.test(name) || name.includes("application/pdf");
}

export async function downloadFileViaBlob(url: string, fileName?: string): Promise<void> {
  if (!url) return;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName || "dokumento";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  } catch (err) {
    console.warn("[InSystemDocViewer] Blob download fallback:", err);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "dokumento";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

let pdfjsPromise: Promise<any> | null = null;
export function getPdfJs(): Promise<any> {
  if ((window as any).pdfjsLib) {
    return Promise.resolve((window as any).pdfjsLib);
  }
  if (!pdfjsPromise) {
    pdfjsPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/vendor/pdfjs/pdf.min.js";
      script.onload = () => {
        const lib = (window as any).pdfjsLib;
        if (lib) {
          lib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.js";
        }
        resolve(lib);
      };
      script.onerror = (err) => {
        pdfjsPromise = null;
        reject(err);
      };
      document.head.appendChild(script);
    });
  }
  return pdfjsPromise;
}

function IconChevronLeft({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconChevronRight({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconZoomIn({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

function IconZoomOut({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

function IconRotate({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function IconDownload({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconEye({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconFile({ size = 14, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function IconAlertTriangle({ size = 14, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function PdfCanvasViewer({
  url,
  title,
  fileName,
}: {
  url: string;
  title: string;
  fileName?: string;
}) {
  const { isEn } = useTranslation();
  const [numPages, setNumPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [rotation, setRotation] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfDocRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCurrentPage(1);

    async function loadPdf() {
      try {
        const pdfjs = await getPdfJs();
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: Hindi makarga ang PDF mula sa server.`);
        }
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const pdf = await pdfjs.getDocument({
          data: new Uint8Array(buf),
          disableRange: true,
          disableStream: true,
        }).promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        console.error("[PdfCanvasViewer] Error loading PDF:", err);
        setError(err?.message || "Hindi mabuksan ang PDF file.");
        setLoading(false);
      }
    }

    loadPdf();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (_) {}
      }
    };
  }, [url]);

  useEffect(() => {
    if (!pdfDocRef.current || loading || error) return;
    let cancelled = false;

    async function renderPage() {
      try {
        const page = await pdfDocRef.current.getPage(currentPage);
        if (cancelled) return;
        const viewport = page.getViewport({ scale, rotation });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        if (!context) return;

        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch (_) {}
        }

        const renderContext = {
          canvasContext: context,
          transform,
          viewport,
        };

        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;
      } catch (err: any) {
        if (err?.name === "RenderingCancelledException") return;
        console.warn("[PdfCanvasViewer] Render warning:", err);
      }
    }

    renderPage();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (_) {}
      }
    };
  }, [currentPage, scale, rotation, loading, error]);

  const handleZoomIn = () => setScale((s) => Math.min(Number((s + 0.2).toFixed(1)), 3.0));
  const handleZoomOut = () => setScale((s) => Math.max(Number((s - 0.2).toFixed(1)), 0.6));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);
  const handleFitWidth = () => setScale(1.1);

  if (error) {
    return (
      <div className="zp-doc-error-box">
        <IconAlertTriangle size={32} style={{ color: "#f59e0b", marginBottom: 12 }} />
        <h4 style={{ margin: "0 0 8px 0" }}>{isEn ? "Cannot display PDF preview" : "Hindi maipakita ang PDF preview"}</h4>
        <p style={{ fontSize: 13, margin: "0 0 16px 0", maxWidth: 420, textAlign: "center", opacity: 0.85 }}>
          {error}
        </p>
        <button
          type="button"
          onClick={() => void downloadFileViaBlob(url, fileName || "dokumento.pdf")}
          className="zp-lightbox-download-btn"
        >
          <IconDownload size={14} />
          {isEn ? "Download PDF Directly" : "I-download ang PDF nang Diretso"}
        </button>
      </div>
    );
  }

  return (
    <div className="zp-pdf-viewer-wrap">
      {/* Floating Modern Toolbar */}
      <div className="zp-pdf-toolbar">
        {/* Pagination */}
        <div className="zp-pdf-tb-group">
          <button
            type="button"
            className="zp-pdf-tb-btn"
            disabled={currentPage <= 1 || loading}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            title={isEn ? "Previous Page" : "Nakaraang Pahina"}
            aria-label={isEn ? "Previous Page" : "Nakaraang Pahina"}
          >
            <IconChevronLeft size={13} />
          </button>
          <span className="zp-pdf-tb-pages">
            {isEn ? "Page" : "Pahina"} <strong>{currentPage}</strong> / {numPages}
          </span>
          <button
            type="button"
            className="zp-pdf-tb-btn"
            disabled={currentPage >= numPages || loading}
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            title={isEn ? "Next Page" : "Susunod na Pahina"}
            aria-label={isEn ? "Next Page" : "Susunod na Pahina"}
          >
            <IconChevronRight size={13} />
          </button>
        </div>

        {/* Zoom & Rotation */}
        <div className="zp-pdf-tb-group">
          <button
            type="button"
            className="zp-pdf-tb-btn"
            disabled={scale <= 0.6 || loading}
            onClick={handleZoomOut}
            title={isEn ? "Zoom Out" : "Liitan (Zoom Out)"}
            aria-label={isEn ? "Zoom Out" : "Liitan"}
          >
            <IconZoomOut size={13} />
          </button>
          <span className="zp-pdf-tb-zoom-val">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            className="zp-pdf-tb-btn"
            disabled={scale >= 3.0 || loading}
            onClick={handleZoomIn}
            title={isEn ? "Zoom In" : "Palakihin (Zoom In)"}
            aria-label={isEn ? "Zoom In" : "Palakihin"}
          >
            <IconZoomIn size={13} />
          </button>
          <button
            type="button"
            className="zp-pdf-tb-btn"
            onClick={handleFitWidth}
            title={isEn ? "Fit to Screen" : "I-angkop sa Screen (Fit Width)"}
          >
            Fit
          </button>
          <button
            type="button"
            className="zp-pdf-tb-btn"
            onClick={handleRotate}
            title={isEn ? "Rotate 90°" : "Pihitin nang 90° (Rotate)"}
            aria-label={isEn ? "Rotate 90°" : "Pihitin nang 90°"}
          >
            <IconRotate size={13} />
          </button>
        </div>
      </div>

      {/* Canvas Viewport Container */}
      <div className="zp-pdf-canvas-viewport">
        {loading && (
          <div className="zp-doc-loading-overlay">
            <div className="zp-spinner" />
            <span>{isEn ? "Loading PDF document in system canvas..." : "Ikinakarga ang PDF dokumento sa in-system canvas..."}</span>
          </div>
        )}
        <div className="zp-pdf-canvas-canvas-wrap">
          <canvas ref={canvasRef} className="zp-pdf-rendered-canvas" />
        </div>
      </div>
    </div>
  );
}

export function ImagePreviewViewer({
  url,
  title,
  fileName,
}: {
  url: string;
  title: string;
  fileName?: string;
}) {
  const { isEn } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(1.0);

  const handleZoomIn = () => setScale((s) => Math.min(Number((s + 0.25).toFixed(2)), 3.0));
  const handleZoomOut = () => setScale((s) => Math.max(Number((s - 0.25).toFixed(2)), 0.5));
  const handleReset = () => setScale(1.0);

  if (loadError) {
    return (
      <div className="zp-doc-error-box">
        <IconAlertTriangle size={32} style={{ color: "#f59e0b", marginBottom: 12 }} />
        <h4 style={{ margin: "0 0 8px 0" }}>{isEn ? "Cannot display image" : "Hindi maipakita ang larawan"}</h4>
        <p style={{ fontSize: 13, margin: "0 0 16px 0", maxWidth: 400, textAlign: "center", opacity: 0.85 }}>
          {loadError}
        </p>
        <a href={url} download={fileName || "larawan"} className="zp-lightbox-download-btn">
          <IconDownload size={14} />
          {isEn ? "Download Image" : "I-download ang Larawan"}
        </a>
      </div>
    );
  }

  return (
    <div className="zp-img-viewer-wrap">
      <div className="zp-pdf-toolbar">
        <div className="zp-pdf-tb-group">
          <button
            type="button"
            className="zp-pdf-tb-btn"
            disabled={scale <= 0.5}
            onClick={handleZoomOut}
            title={isEn ? "Zoom Out" : "Liitan (Zoom Out)"}
          >
            <IconZoomOut size={13} />
          </button>
          <span className="zp-pdf-tb-zoom-val">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            className="zp-pdf-tb-btn"
            disabled={scale >= 3.0}
            onClick={handleZoomIn}
            title={isEn ? "Zoom In" : "Palakihin (Zoom In)"}
          >
            <IconZoomIn size={13} />
          </button>
          <button
            type="button"
            className="zp-pdf-tb-btn"
            onClick={handleReset}
            title={isEn ? "Reset to original size" : "Ibalik sa orihinal na sukat"}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="zp-lightbox-img-viewport">
        {loading && (
          <div className="zp-doc-loading-overlay">
            <div className="zp-spinner" />
            <span>{isEn ? "Loading image..." : "Ikinakarga ang larawan..."}</span>
          </div>
        )}
        <img
          src={url}
          alt={title}
          className="zp-lightbox-img"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "center center",
            transition: "transform 0.15s ease",
          }}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setLoadError(isEn ? "Failed to load image from server." : "Hindi maikarga ang larawan mula sa server.");
          }}
        />
      </div>
    </div>
  );
}

export function GenericDocCard({
  url,
  fileName,
  size,
  title,
}: {
  url: string;
  fileName?: string;
  size?: number;
  title: string;
}) {
  const { isEn } = useTranslation();
  const rawExt = (fileName || url).split(".").pop()?.toUpperCase() || "FILE";
  const ext = rawExt.length > 6 ? "FILE" : rawExt;

  return (
    <div className="zp-generic-doc-box">
      <div className="zp-generic-doc-icon-wrap">
        <IconFile size={46} style={{ color: "var(--apple-accent, #0071e3)" }} />
        <span className="zp-generic-doc-badge">{ext}</span>
      </div>
      <h3 className="zp-generic-doc-title">{fileName || title}</h3>
      {size ? <span className="zp-generic-doc-size">{formatFileSize(size)}</span> : null}
      <p className="zp-generic-doc-desc">
        {isEn
          ? <>This file type (<strong>.{ext.toLowerCase()}</strong>) cannot be directly displayed in the browser viewer. You may download it to review or open with its dedicated desktop software on your device.</>
          : <>Ang uri ng dokumentong ito (<strong>.{ext.toLowerCase()}</strong>) ay hindi direktang maipakita sa web browser reader. Maaari itong i-download kung nais mong suriin o buksan gamit ang nakalaang desktop application sa iyong computer.</>}
      </p>
      <button
        type="button"
        onClick={() => void downloadFileViaBlob(url, fileName || `dokumento.${ext.toLowerCase()}`)}
        className="zp-lightbox-download-btn"
      >
        <IconDownload size={14} />
        {isEn ? `Download File (${ext})` : `I-download ang File (${ext})`}
      </button>
    </div>
  );
}

export function DocViewerContent({
  url,
  title,
  fileName,
  isPdf,
  isImg,
  size,
}: {
  url: string;
  title: string;
  fileName?: string;
  isPdf?: boolean;
  isImg?: boolean;
  size?: number;
}) {
  if (isImg) {
    return <ImagePreviewViewer url={url} title={title} fileName={fileName} />;
  }
  if (isPdf) {
    return <PdfCanvasViewer url={url} title={title} fileName={fileName} />;
  }
  return <GenericDocCard url={url} fileName={fileName} size={size} title={title} />;
}

export function InSystemDocModal({
  media,
  onClose,
}: {
  media: PreviewMedia | null;
  onClose: () => void;
}) {
  const { isEn } = useTranslation();

  useEffect(() => {
    if (!media) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [media, onClose]);

  if (!media) return null;

  return (
    <div className="zp-lightbox-backdrop" onClick={onClose}>
      <div className="zp-lightbox-content" onClick={(e) => e.stopPropagation()}>
        <div className="zp-lightbox-head">
          <div className="zp-lightbox-meta">
            <span
              className={`zp-lightbox-badge ${
                media.isPdf
                  ? "zp-lightbox-badge--pdf"
                  : media.isImg
                  ? "zp-lightbox-badge--img"
                  : "zp-lightbox-badge--doc"
              }`}
            >
              {media.isPdf ? (isEn ? "PDF Document" : "PDF Dokumento") : media.isImg ? (isEn ? "Image / Plan" : "Larawan / Plano") : (isEn ? "Document" : "Dokumento")}
            </span>
            <span className="zp-lightbox-title" title={media.title}>
              {media.title}
            </span>
            {media.size ? (
              <span className="zp-lightbox-size">({formatFileSize(media.size)})</span>
            ) : null}
          </div>
          <div className="zp-lightbox-head-actions">
            <button
              type="button"
              onClick={() => void downloadFileViaBlob(media.url, media.fileName || "dokumento")}
              className="zp-btn-download-file"
              title={isEn ? "Download file" : "I-download ang file"}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "none", border: "1px solid var(--border)", color: "inherit", borderRadius: 6, cursor: "pointer", font: "inherit" }}
            >
              <IconDownload size={13} />
              {isEn ? "Download" : "I-download"}
            </button>
            <button
              type="button"
              className="zp-close-btn"
              onClick={onClose}
              title={isEn ? "Close (or press Esc)" : "Isara (o pindutin ang Esc)"}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="zp-lightbox-body">
          <DocViewerContent
            url={media.url}
            title={media.title}
            fileName={media.fileName}
            isPdf={media.isPdf}
            isImg={media.isImg}
            size={media.size}
          />
        </div>

        <div className="zp-lightbox-foot">
          <span className="zp-lightbox-hint">
            <IconEye size={13} />
            {isEn ? "Viewed directly inside Infatrack System (No external tab opened)" : "Mismong tinitingnan sa Infatrack System (Walang bubuksang bagong tab)"}
          </span>
          <div className="zp-lightbox-foot-actions">
            <button
              type="button"
              onClick={() => void downloadFileViaBlob(media.url, media.fileName || "dokumento")}
              className="zp-lightbox-download-btn"
            >
              <IconDownload size={14} />
              {isEn ? "Download Copy" : "I-download ang Kopya"}
            </button>
            <button
              type="button"
              className="zp-lightbox-close-btn"
              onClick={onClose}
            >
              {isEn ? "Close Viewer" : "Isara ang Viewer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

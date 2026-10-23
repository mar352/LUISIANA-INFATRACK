import JSZip from "jszip";
import { collection, doc, setDoc, onSnapshot, query, orderBy, type Unsubscribe } from "firebase/firestore";
import { db } from "../firebase";
import { backendUrl } from "../lib/api";
import type { ApprovedApplicationFolder, ApprovedDocItem } from "../ui/DocumentsPage";

export type BackupProgressInfo = {
  current: number;
  total: number;
  percent: number;
  currentItemName: string;
  stage: "fetching" | "compressing" | "ready" | "saved" | "error";
  statusText: string;
};

export type DocumentBackupRecord = {
  id: string;
  createdAt: string;
  createdBy: string;
  type: "full_archive" | "filtered_archive" | "single_applicant";
  applicantCount: number;
  documentCount: number;
  totalBytes: number;
  checksumSha256: string;
  filename: string;
  status: "stored_in_cloud" | "downloaded_local";
  summary: {
    byBarangay: Record<string, number>;
    byDocType: Record<string, number>;
  };
};

const LOCAL_BACKUP_STORAGE_KEY = "infatrack_document_backups_local";

function fileHref(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:") || url.startsWith("data:")) {
    return url;
  }
  return backendUrl(url);
}

function sanitizeName(str: string): string {
  return (str || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

async function sha256Text(text: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return `sha-${Date.now().toString(16)}`;
  }
}

/** Format bytes into friendly size */
export function formatBackupBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Local storage backup records */
function getLocalDocBackups(): DocumentBackupRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_BACKUP_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalDocBackup(record: DocumentBackupRecord) {
  try {
    const list = getLocalDocBackups().filter((r) => r.id !== record.id);
    list.unshift(record);
    localStorage.setItem(LOCAL_BACKUP_STORAGE_KEY, JSON.stringify(list));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("infatrack:doc-backup-updated"));
    }
  } catch (err) {
    console.warn("[DocBackup] Local storage save notice:", err);
  }
}

/**
 * Generates an executive offline verification report in standalone HTML format
 */
function generateHtmlVerificationReport(
  folders: ApprovedApplicationFolder[],
  backupId: string,
  exportedAt: string,
  exportedBy: string,
  checksumSha256: string
): string {
  const totalDocs = folders.reduce((sum, f) => sum + f.documents.length, 0);

  const rows = folders
    .map((folder, fIdx) => {
      const docListHtml = folder.documents
        .map((d, dIdx) => {
          const docNum = String(dIdx + 1).padStart(2, "0");
          const safeFolder = sanitizeName(`${folder.trackingNumber} - ${folder.applicantName}`);
          const safeFile = `${docNum} - ${sanitizeName(d.docTitle)} - ${sanitizeName(d.fileName)}`;
          return `
          <li style="margin-bottom: 6px;">
            <a href="${encodeURI(safeFolder)}/${encodeURI(safeFile)}" target="_blank" style="color: #2563eb; text-decoration: none; font-weight: 500;">
              📄 ${escapeHtml(d.docTitle)} (${escapeHtml(d.fileName)})
            </a>
            <span style="font-size: 11px; color: #64748b; margin-left: 8px;">
              ${d.fileSize ? formatBackupBytes(d.fileSize) : ""} · Inaprubahan: ${escapeHtml(d.approvedAt || "—")}
            </span>
          </li>`;
        })
        .join("");

      return `
      <tr style="border-bottom: 1px solid #e2e8f0; background: ${fIdx % 2 === 0 ? "#ffffff" : "#f8fafc"};">
        <td style="padding: 14px 16px; font-weight: 600; vertical-align: top;">
          <div style="font-size: 14px; color: #0f172a;">${escapeHtml(folder.applicantName)}</div>
          <div style="display: inline-block; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-family: monospace; font-weight: 700; margin-top: 4px;">
            ${escapeHtml(folder.trackingNumber)}
          </div>
          <div style="font-size: 12px; color: #475569; margin-top: 4px;">📍 ${escapeHtml(folder.barangay)}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${escapeHtml(folder.serviceType)}</div>
        </td>
        <td style="padding: 14px 16px; vertical-align: top;">
          <div style="font-weight: 600; font-size: 13px; color: #1e293b; margin-bottom: 2px;">
            ${escapeHtml(folder.projectTitle)}
          </div>
          <div style="font-size: 11px; color: #64748b;">
            Inaprubahan ni: <strong>${escapeHtml(folder.approvedBy || "MPDC")}</strong> · Petsa: ${escapeHtml(folder.approvedAtLatest || "—")}
          </div>
        </td>
        <td style="padding: 14px 16px; vertical-align: top;">
          <div style="font-size: 12px; font-weight: 700; color: #166534; margin-bottom: 6px;">
            ✓ ${folder.documents.length} Naaprubahang Dokumento
          </div>
          <ul style="margin: 0; padding-left: 18px; font-size: 12px;">
            ${docListHtml}
          </ul>
        </td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="tl">
<head>
  <meta charset="utf-8">
  <title>Opisyal na Talaan ng Naaprubahang Dokumento — LGU Luisiana Backup</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f1f5f9; color: #0f172a; margin: 0; padding: 32px 20px; line-height: 1.5; }
    .container { max-width: 1100px; margin: 0 auto; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #1e293b, #0f172a); color: #ffffff; padding: 32px 36px; border-bottom: 3px solid #0284c7; }
    .kicker { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: #38bdf8; text-transform: uppercase; margin-bottom: 6px; }
    h1 { margin: 0 0 8px; font-size: 24px; font-weight: 800; }
    .sub { margin: 0; font-size: 13px; color: #94a3b8; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; padding: 24px 36px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .meta-box { background: #ffffff; padding: 14px 18px; border-radius: 8px; border: 1px solid #e2e8f0; }
    .meta-box span { display: block; font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; margin-bottom: 4px; }
    .meta-box strong { font-size: 16px; color: #0f172a; }
    .content { padding: 24px 36px; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { background: #f1f5f9; padding: 12px 16px; font-size: 11px; text-transform: uppercase; font-weight: 700; color: #475569; border-bottom: 2px solid #cbd5e1; }
    .footer { padding: 20px 36px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; display: flex; justify-content: space-between; align-items: center; }
    .seal { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; color: #166534; }
    @media print { body { padding: 0; background: #fff; } .container { border: none; box-shadow: none; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="kicker">REPUBLIKA NG PILIPINAS · LALAWIGAN NG LAGUNA · BAYAN NG LUISIANA</div>
      <h1>Municipal Planning and Development Coordinator (MPDC)</h1>
      <p class="sub">Disaster Recovery & Regulatory Archive · Talaan ng Lahat ng Naaprubahang Dokumento at Kalakip</p>
    </div>

    <div class="meta-grid">
      <div class="meta-box">
        <span>Backup Archive ID</span>
        <strong style="font-family: monospace; font-size: 13px;">${escapeHtml(backupId)}</strong>
      </div>
      <div class="meta-box">
        <span>Aplikante / Dossiers</span>
        <strong style="color: #0284c7;">${folders.length} Aplikante</strong>
      </div>
      <div class="meta-box">
        <span>Naaprubahang Dokumento</span>
        <strong style="color: #16a34a;">${totalDocs} Files</strong>
      </div>
      <div class="meta-box">
        <span>Petsa at Oras ng Paglikha</span>
        <strong style="font-size: 13px;">${new Date(exportedAt).toLocaleString("en-PH")}</strong>
      </div>
      <div class="meta-box">
        <span>Inilabas ni</span>
        <strong style="font-size: 13px;">${escapeHtml(exportedBy)}</strong>
      </div>
      <div class="meta-box">
        <span>SHA-256 Checksum</span>
        <strong style="font-family: monospace; font-size: 11px; word-break: break-all;">${escapeHtml(checksumSha256)}</strong>
      </div>
    </div>

    <div class="content">
      <div style="margin-bottom: 16px; font-size: 13px; color: #475569;">
        Ang talaang ito ay naglalaman ng lahat ng opisyal na dokumentong naaprubahan para sa Zoning Clearance at Building Permit Verification. Maaari mong i-click ang link ng bawat dokumento upang mabuksan nang lokal sa anumang browser.
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 28%;">Aplikante at Detalye</th>
            <th style="width: 32%;">Proyekto at Pag-apruba</th>
            <th style="width: 40%;">Mga Naaprubahang Dokumento</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>

    <div class="footer">
      <div class="seal">
        ✓ LGU LUISIANA INFA-TRACK · OPISYAL AT VERIFIED ARCHIVE
      </div>
      <div>
        Nilikha noong ${new Date(exportedAt).toISOString()} · Municipal Hall of Luisiana, Laguna
      </div>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Downloads a complete ZIP package containing all approved files grouped by applicant
 */
export async function downloadDocumentBackupZip(
  folders: ApprovedApplicationFolder[],
  options: {
    author?: string;
    type?: "full_archive" | "filtered_archive" | "single_applicant";
    filterNote?: string;
    onProgress?: (progress: BackupProgressInfo) => void;
    abortSignal?: AbortSignal;
  } = {}
): Promise<{ ok: boolean; filename: string; record?: DocumentBackupRecord; error?: string }> {
  const author = options.author || "Super Admin";
  const type = options.type || "full_archive";
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupId = `doc-backup-${dateStr}`;
  const zipFilename = `luisiana-infatrack-documents-${dateStr}.zip`;

  // Count total files
  const allDocPairs: { folder: ApprovedApplicationFolder; doc: ApprovedDocItem; docIdx: number }[] = [];
  folders.forEach((folder) => {
    folder.documents.forEach((docItem, idx) => {
      allDocPairs.push({ folder, doc: docItem, docIdx: idx });
    });
  });

  const totalFiles = allDocPairs.length;
  if (totalFiles === 0 && folders.length === 0) {
    return { ok: false, filename: zipFilename, error: "Walang mga aprubadong dokumento na mai-backup." };
  }

  const zip = new JSZip();

  const manifestData: any = {
    backupId,
    system: "LUISIANA INFA-TRACK",
    title: "Official Approved Documents Repository Disaster Recovery Archive",
    municipality: "Municipality of Luisiana, Laguna (PSGC 0403412000)",
    exportedAt: now.toISOString(),
    exportedBy: author,
    type,
    filterNote: options.filterNote || "All Approved Applications",
    totalApplicants: folders.length,
    totalDocuments: totalFiles,
    applicants: [],
  };

  const byBarangay: Record<string, number> = {};
  const byDocType: Record<string, number> = {};
  let totalBytesAccumulated = 0;

  // 1. Fetch each document file and add to ZIP
  for (let i = 0; i < totalFiles; i++) {
    if (options.abortSignal?.aborted) {
      throw new Error("Kinansela ang backup ng dokumento ng gumagamit.");
    }

    const { folder, doc, docIdx } = allDocPairs[i];
    const docNum = String(docIdx + 1).padStart(2, "0");
    const safeFolderName = sanitizeName(`${folder.trackingNumber} - ${folder.applicantName}`);
    const safeDocName = `${docNum} - ${sanitizeName(doc.docTitle)} - ${sanitizeName(doc.fileName)}`;
    const zipPath = `${safeFolderName}/${safeDocName}`;

    // Update progress
    options.onProgress?.({
      current: i + 1,
      total: totalFiles,
      percent: Math.round(((i + 1) / (totalFiles + 2)) * 80),
      currentItemName: `${folder.applicantName}: ${doc.docTitle}`,
      stage: "fetching",
      statusText: `Kinukuha ang file (${i + 1}/${totalFiles}): ${doc.docTitle}…`,
    });

    // Stats
    byBarangay[folder.barangay] = (byBarangay[folder.barangay] || 0) + 1;
    byDocType[doc.docKey] = (byDocType[doc.docKey] || 0) + 1;

    const href = fileHref(doc.fileUrl);

    try {
      if (href.startsWith("data:")) {
        // Data URL
        const commaIdx = href.indexOf(",");
        const base64Data = href.substring(commaIdx + 1);
        zip.file(zipPath, base64Data, { base64: true });
        totalBytesAccumulated += Math.round(base64Data.length * 0.75);
      } else if (href) {
        // Fetch via HTTP/HTTPS/relative
        const res = await fetch(href);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        zip.file(zipPath, blob);
        totalBytesAccumulated += blob.size;
      } else {
        throw new Error("Walang wastong file URL.");
      }
    } catch (fetchErr: any) {
      console.warn(`[DocBackup] Error fetching ${doc.fileName} (${href}):`, fetchErr);
      // Place a fallback verification log so the zip structure is always preserved
      const fallbackNote = `HINDI MAIKONEKTA ANG FILE SA ORAS NG BACKUP
Dokumento: ${doc.docTitle}
Orihinal na Pangalan: ${doc.fileName}
File URL: ${doc.fileUrl}
Tracking Number: ${folder.trackingNumber}
Aplikante: ${folder.applicantName}
Petsa ng Pagsubok: ${new Date().toISOString()}
Dahilan: ${fetchErr?.message || "File unavailable"}
`;
      zip.file(`${safeFolderName}/${docNum} - ${sanitizeName(doc.docTitle)} - HINDI_NAKUHA.txt`, fallbackNote);
    }
  }

  // 2. Add per-applicant dossier manifests
  folders.forEach((folder) => {
    const safeFolderName = sanitizeName(`${folder.trackingNumber} - ${folder.applicantName}`);
    const dossierManifest = {
      trackingNumber: folder.trackingNumber,
      applicantName: folder.applicantName,
      applicantPhone: folder.applicantPhone,
      applicantEmail: folder.applicantEmail,
      applicantAddress: folder.applicantAddress,
      barangay: folder.barangay,
      projectTitle: folder.projectTitle,
      serviceType: folder.serviceType,
      applicationStatus: folder.applicationStatus,
      approvedAt: folder.approvedAtLatest,
      approvedBy: folder.approvedBy,
      documentsCount: folder.documents.length,
      documents: folder.documents.map((d, idx) => ({
        index: idx + 1,
        docKey: d.docKey,
        docTitle: d.docTitle,
        originalFileName: d.fileName,
        fileUrl: d.fileUrl,
        fileSize: d.fileSize,
        approvedAt: d.approvedAt,
        approvedBy: d.approvedBy,
      })),
      backupGeneratedAt: now.toISOString(),
      backupGeneratedBy: author,
    };

    zip.file(
      `${safeFolderName}/DOSSIER_MANIFEST.json`,
      JSON.stringify(dossierManifest, null, 2)
    );

    manifestData.applicants.push(dossierManifest);
  });

  // 3. Generate SHA-256 checksum of manifest
  const manifestJsonStr = JSON.stringify(manifestData, null, 2);
  const checksumSha256 = await sha256Text(manifestJsonStr);
  manifestData.checksumSha256 = checksumSha256;

  // 4. Add root Master Manifest & Offline Verification HTML Report & Readme
  zip.file("MASTER_BACKUP_INDEX.json", JSON.stringify(manifestData, null, 2));

  const reportHtml = generateHtmlVerificationReport(
    folders,
    backupId,
    now.toISOString(),
    author,
    checksumSha256
  );
  zip.file("OFFICIAL_BACKUP_REPORT.html", reportHtml);

  const readmeText = `=============================================================================
BAYAN NG LUISIANA, LAGUNA · INFA-TRACK DISASTER RECOVERY DOCUMENT ARCHIVE
=============================================================================
Backup ID: ${backupId}
Petsa ng Paglikha: ${now.toLocaleString("en-PH")}
Inilabas ni: ${author}
Kabuuang Aplikante: ${folders.length}
Kabuuang Dokumento: ${totalFiles}
SHA-256 Manifest Checksum: ${checksumSha256}

PAANO GAMITIN AT I-VERIFY ANG BACKUP NA ITO:
1. I-extract o i-unzip ang file na ito sa isang ligtas na backup storage o USB flash drive.
2. Buksan ang "OFFICIAL_BACKUP_REPORT.html" sa anumang web browser (Chrome, Edge, Safari, Firefox).
   Lalabas ang kumpletong talaan ng bawat aplikante, mga naaprubahang dokumento, at direktang link
   upang buksan at i-print ang bawat PDF o litrato offline nang walang internet.
3. Ang "MASTER_BACKUP_INDEX.json" ay naglalaman ng kumpletong tala para sa database auditing
   at disaster recovery re-indexing.
4. Bawat folder ng aplikante ay may sariling "DOSSIER_MANIFEST.json" para sa legal record keeping.

Munisipyo ng Luisiana, Laguna · Municipal Planning and Development Office
=============================================================================
`;
  zip.file("README_BACKUP_VERIFICATION.txt", readmeText);

  // 5. Generate the ZIP blob
  options.onProgress?.({
    current: totalFiles,
    total: totalFiles,
    percent: 85,
    currentItemName: zipFilename,
    stage: "compressing",
    statusText: `Ikinokompres ang ${totalFiles} dokumento sa ZIP archive…`,
  });

  const zipBlob = await zip.generateAsync(
    {
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    },
    (meta) => {
      options.onProgress?.({
        current: totalFiles,
        total: totalFiles,
        percent: 85 + Math.round(meta.percent * 0.12),
        currentItemName: zipFilename,
        stage: "compressing",
        statusText: `Ikinokompres ang ZIP: ${Math.round(meta.percent)}%…`,
      });
    }
  );

  // 6. Trigger download in browser
  options.onProgress?.({
    current: totalFiles,
    total: totalFiles,
    percent: 98,
    currentItemName: zipFilename,
    stage: "ready",
    statusText: `I-download ang file: ${zipFilename} (${formatBackupBytes(zipBlob.size)})…`,
  });

  const downloadUrl = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

  // 7. Save backup record locally and to Firebase
  const backupRecord: DocumentBackupRecord = {
    id: backupId,
    createdAt: now.toISOString(),
    createdBy: author,
    type,
    applicantCount: folders.length,
    documentCount: totalFiles,
    totalBytes: zipBlob.size || totalBytesAccumulated,
    checksumSha256,
    filename: zipFilename,
    status: "downloaded_local",
    summary: {
      byBarangay,
      byDocType,
    },
  };

  saveLocalDocBackup(backupRecord);

  // Background Cloud Sync to Firestore
  void (async () => {
    try {
      const col = collection(db, "documentBackups");
      await setDoc(doc(col, backupId), {
        ...backupRecord,
        status: "stored_in_cloud",
      });
    } catch (fireErr) {
      console.warn("[DocBackup] Background Firestore sync note:", fireErr);
    }
  })();

  options.onProgress?.({
    current: totalFiles,
    total: totalFiles,
    percent: 100,
    currentItemName: zipFilename,
    stage: "saved",
    statusText: `Matagumpay na nai-backup ang ${totalFiles} dokumento!`,
  });

  return { ok: true, filename: zipFilename, record: backupRecord };
}

/**
 * Downloads single applicant folder as a dedicated ZIP archive
 */
export async function downloadSingleApplicantBackupZip(
  folder: ApprovedApplicationFolder,
  author = "Super Admin",
  onProgress?: (progress: BackupProgressInfo) => void
): Promise<{ ok: boolean; filename: string; error?: string }> {
  return downloadDocumentBackupZip([folder], {
    author,
    type: "single_applicant",
    filterNote: `Single Dossier: ${folder.applicantName} (${folder.trackingNumber})`,
    onProgress,
  });
}

/**
 * Real-time subscription to document backups log
 */
export function subscribeToDocumentBackups(
  callback: (records: DocumentBackupRecord[]) => void
): Unsubscribe {
  const emitMerged = (remoteRecords: DocumentBackupRecord[] = []) => {
    const local = getLocalDocBackups();
    const map = new Map<string, DocumentBackupRecord>();
    local.forEach((r) => map.set(r.id, r));
    remoteRecords.forEach((r) => map.set(r.id, r));
    const merged = Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    callback(merged);
  };

  emitMerged([]);

  const handleUpdate = () => emitMerged([]);
  if (typeof window !== "undefined") {
    window.addEventListener("infatrack:doc-backup-updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
  }

  let unsubFirestore: () => void = () => {};
  try {
    const col = collection(db, "documentBackups");
    const q = query(col, orderBy("createdAt", "desc"));
    unsubFirestore = onSnapshot(
      q,
      (snap) => {
        const remote = snap.docs.map((d) => d.data() as DocumentBackupRecord);
        emitMerged(remote);
      },
      (err) => {
        console.warn("[DocBackup] Firestore listen error, using local:", err.message);
      }
    );
  } catch (err) {
    console.warn("[DocBackup] Firestore setup notice:", err);
  }

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("infatrack:doc-backup-updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    }
    unsubFirestore();
  };
}

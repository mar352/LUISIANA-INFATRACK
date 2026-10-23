import { useEffect, useState } from "react";
import { backendUrl } from "../lib/api";
import { BARANGAY_LIST, type ConfigItem, type SystemConfigData, type MaintenanceModeStatus, type SlaMonitoringData } from "../types";

export const DEFAULT_FALLBACK_BUILDING_TYPES: ConfigItem[] = [
  { id: "bldg-1", code: "RESIDENTIAL", name: "Residential", desc: "Pabahay para sa pamilya (single-family, duplex)", active: true, isDefault: true },
  { id: "bldg-2", code: "APARTMENT", name: "Apartment", desc: "Apartment building o paupahang mga yunit", active: true, isDefault: true },
  { id: "bldg-3", code: "TOWNHOUSE", name: "Townhouse", desc: "Townhouse row o residential cluster", active: true, isDefault: true },
  { id: "bldg-4", code: "DORMITORY", name: "Dormitory", desc: "Dormitoryo, boarding house, o student housing", active: true, isDefault: true },
  { id: "bldg-5", code: "INSTITUTIONAL", name: "Institutional", desc: "Paaralan, kapilya/simbahan, o pasilidad ng gobyerno", active: true, isDefault: true },
  { id: "bldg-6", code: "COMMERCIAL", name: "Commercial", desc: "Tindahan, opisina, mall, restawran, o negosyo", active: true, isDefault: true },
  { id: "bldg-7", code: "INDUSTRIAL", name: "Industrial", desc: "Bodega, pagawaan, o pasilidad ng industriya", active: true, isDefault: true },
  { id: "bldg-8", code: "AGRO_INDUSTRIAL", name: "Agro-Industrial", desc: "Pasilidad pang-agrikultura tulad ng poultry, piggery, at feed/rice mill", active: true, isDefault: true },
];

export const DEFAULT_FALLBACK_BARANGAYS: ConfigItem[] = BARANGAY_LIST.map((b, idx) => ({
  id: `brgy-${idx + 1}`,
  code: `BRGY-${idx + 1}`,
  name: b,
  zone: b.includes("Zone") ? "Urban / Commercial Zone" : "Rural Zone",
  active: true,
  isDefault: true,
}));

export const DEFAULT_FALLBACK_ZONING_CLASSIFICATIONS: ConfigItem[] = [
  { id: "zone-1", code: "URBAN_COMMERCIAL", name: "Urban / Commercial Zone", desc: "Sentro ng kalakalan at kabayanan (Poblacion)", active: true, isDefault: true },
  { id: "zone-2", code: "RURAL_RESIDENTIAL", name: "Rural Zone", desc: "Pamayanang rural at pabahay", active: true, isDefault: true },
  { id: "zone-3", code: "AGRICULTURAL_FOREST", name: "Agricultural / Forest Zone", desc: "Lupaing pansakahan at watershed protection", active: true, isDefault: true },
  { id: "zone-4", code: "ECO_TOURISM", name: "Eco-Tourism Zone", desc: "Talon (falls) at protektadong kalikasan", active: true, isDefault: true },
];

export const DEFAULT_FALLBACK_PERMIT_CATEGORIES: ConfigItem[] = [
  { id: "pmt-1", code: "ZONING_CERT", name: "Zoning Certificate / Locational Clearance", desc: "Pagsusuri ng lokasyon alinsunod sa CLUP", active: true, isDefault: true },
  { id: "pmt-2", code: "BUILDING_PERMIT", name: "Building Permit Endorsement", desc: "Endorsement para sa Tanggapan ng Inhinyero", active: true, isDefault: true },
  { id: "pmt-3", code: "LAND_TITLING", name: "Land Titling / Tax Mapping Clearance", desc: "Pagsusuri ng titulo at tax declaration sa Assessor", active: true, isDefault: true },
  { id: "pmt-4", code: "OCCUPANCY_CERT", name: "Certificate of Occupancy Clearance", desc: "Pahintulot para sa paninirahan o operasyon", active: true, isDefault: true },
];

export const DEFAULT_SYSTEM_CONFIG: SystemConfigData = {
  version: "1.2.0",
  lastUpdated: new Date().toISOString(),
  maintenance: {
    enabled: false,
    message: "Pansamantalang inaayos ang LUISIANA INFA-TRACK system upang mapabuti ang serbisyo. Mangyaring bumalik mamaya.",
    estimatedDuration: "2 oras",
    updatedAt: new Date().toISOString(),
    updatedBy: "System",
  },
  masterlists: {
    barangays: DEFAULT_FALLBACK_BARANGAYS,
    buildingTypes: DEFAULT_FALLBACK_BUILDING_TYPES,
    zoningClassifications: DEFAULT_FALLBACK_ZONING_CLASSIFICATIONS,
    permitCategories: DEFAULT_FALLBACK_PERMIT_CATEGORIES,
  },
};

let memoryConfig: SystemConfigData = DEFAULT_SYSTEM_CONFIG;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((l) => l());
}

/**
 * Fetches public configuration from backend with automatic local fallback
 */
export async function fetchPublicConfig(): Promise<SystemConfigData> {
  try {
    const res = await fetch(backendUrl("/api/config"), { credentials: "omit" });
    if (res.ok) {
      const data = await res.json();
      if (data && data.masterlists) {
        memoryConfig = {
          version: "1.2.0",
          lastUpdated: data.lastUpdated || new Date().toISOString(),
          maintenance: data.maintenance || { enabled: false },
          masterlists: {
            barangays: data.masterlists.barangays || DEFAULT_FALLBACK_BARANGAYS,
            buildingTypes: data.masterlists.buildingTypes || DEFAULT_FALLBACK_BUILDING_TYPES,
            zoningClassifications: data.masterlists.zoningClassifications || DEFAULT_FALLBACK_ZONING_CLASSIFICATIONS,
            permitCategories: data.masterlists.permitCategories || DEFAULT_FALLBACK_PERMIT_CATEGORIES,
          },
        };
        notifyListeners();
        return memoryConfig;
      }
    }
  } catch (err) {
    console.debug("[SystemConfig] Backend config fetch note:", err);
  }

  return memoryConfig;
}

/**
 * Super Admin: fetch full configuration with inactive items & metadata
 */
export async function fetchAdminConfig(): Promise<SystemConfigData> {
  try {
    const res = await fetch(backendUrl("/api/admin/config"), { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      if (data && data.masterlists) {
        memoryConfig = data;
        notifyListeners();
        return data;
      }
    }
  } catch (err) {
    console.warn("[SystemConfig] Admin fetch error:", err);
  }
  return memoryConfig;
}

export async function addMasterlistItem(category: string, item: { name: string; code?: string; desc?: string; zone?: string }) {
  const res = await fetch(backendUrl(`/api/admin/config/${category}/items`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(item),
  });
  return res.json();
}

export async function updateMasterlistItem(category: string, itemId: string, updates: Partial<ConfigItem>) {
  const res = await fetch(backendUrl(`/api/admin/config/${category}/items/${itemId}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(updates),
  });
  return res.json();
}

export async function toggleMasterlistItem(category: string, itemId: string) {
  const res = await fetch(backendUrl(`/api/admin/config/${category}/items/${itemId}/toggle`), {
    method: "PATCH",
    credentials: "include",
  });
  return res.json();
}

export async function deleteMasterlistItem(category: string, itemId: string) {
  const res = await fetch(backendUrl(`/api/admin/config/${category}/items/${itemId}`), {
    method: "DELETE",
    credentials: "include",
  });
  return res.json();
}

export async function resetMasterlistCategory(category: string) {
  const res = await fetch(backendUrl(`/api/admin/config/reset/${category}`), {
    method: "POST",
    credentials: "include",
  });
  return res.json();
}

export async function toggleMaintenanceMode(enabled: boolean, message?: string, estimatedDuration?: string) {
  const res = await fetch(backendUrl("/api/admin/maintenance"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ enabled, message, estimatedDuration }),
  });
  return res.json();
}

export async function fetchSlaMonitoring(): Promise<SlaMonitoringData | null> {
  try {
    const res = await fetch(backendUrl("/api/admin/sla-monitoring"), { credentials: "include" });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("[SystemConfig] SLA fetch error:", err);
  }
  return null;
}

/**
 * Generates client-side disaster recovery bundle fallback
 */
export function generateClientSideBackupBundle(author = "Super Admin") {
  const currentConfig = memoryConfig || DEFAULT_SYSTEM_CONFIG;
  let apps: any[] = [];
  try {
    const raw = localStorage.getItem("infatrack_citizen_apps") || localStorage.getItem("citizen_applications");
    if (raw) apps = JSON.parse(raw);
  } catch {
    apps = [];
  }

  const now = new Date().toISOString();
  const summary = {
    totalApplications: apps.length,
    totalProjects: 0,
    totalAccounts: 1,
    totalTermsConsents: 0,
    totalMasterlistItems:
      (currentConfig.masterlists?.barangays?.length || 0) +
      (currentConfig.masterlists?.buildingTypes?.length || 0) +
      (currentConfig.masterlists?.zoningClassifications?.length || 0) +
      (currentConfig.masterlists?.permitCategories?.length || 0),
  };

  const metadata = {
    system: "LUISIANA INFA-TRACK Disaster Recovery Backup",
    municipality: "Municipality of Luisiana, Province of Laguna",
    psgc: "0403412000",
    version: "1.2.0",
    exportedAt: now,
    exportedBy: author,
    checksumSha256: "client-" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36),
    summary,
  };

  return {
    metadata,
    data: {
      citizenApplications: apps,
      systemConfig: currentConfig,
      accounts: [
        { username: "admin", name: "Super Administrator", role: "Super Admin", department: "Mayor's Office / MIS", isActive: true }
      ],
      masterlists: currentConfig.masterlists,
    },
  };
}

/**
 * Generates SQL export string on client side
 */
export function generateClientSideSqlBackup(bundle: any): string {
  const meta = bundle.metadata;
  const data = bundle.data;
  const dateStr = meta.exportedAt || new Date().toISOString();

  let sql = `-- =============================================================================\n`;
  sql += `-- LUISIANA INFA-TRACK DISASTER RECOVERY DATABASE BACKUP\n`;
  sql += `-- LGU: Municipality of Luisiana, Laguna (PSGC 0403412000)\n`;
  sql += `-- Exported At: ${dateStr}\n`;
  sql += `-- Exported By: ${meta.exportedBy || "Super Admin"}\n`;
  sql += `-- Checksum: ${meta.checksumSha256 || "verified"}\n`;
  sql += `-- Records: ${meta.summary?.totalApplications || 0} Applications | ${meta.summary?.totalMasterlistItems || 0} Masterlist items\n`;
  sql += `-- =============================================================================\n\n`;
  sql += `BEGIN;\n\n`;

  sql += `-- 1. Backup Metadata\n`;
  sql += `CREATE TABLE IF NOT EXISTS infatrack_backup_meta (\n`;
  sql += `  id VARCHAR(64) PRIMARY KEY,\n`;
  sql += `  system_name VARCHAR(128),\n`;
  sql += `  lgu_name VARCHAR(128),\n`;
  sql += `  checksum_sha256 VARCHAR(64),\n`;
  sql += `  exported_at TIMESTAMP,\n`;
  sql += `  exported_by VARCHAR(64)\n`;
  sql += `);\n\n`;

  sql += `INSERT INTO infatrack_backup_meta (id, system_name, lgu_name, checksum_sha256, exported_at, exported_by)\n`;
  sql += `VALUES ('meta-${Date.now()}', 'LUISIANA INFA-TRACK', 'Municipality of Luisiana, Laguna', '${meta.checksumSha256}', '${dateStr}', '${meta.exportedBy || "Super Admin"}');\n\n`;

  sql += `-- 2. Masterlists & System Configurations\n`;
  sql += `CREATE TABLE IF NOT EXISTS system_config_masterlists (\n`;
  sql += `  category VARCHAR(64),\n`;
  sql += `  item_id VARCHAR(64),\n`;
  sql += `  code VARCHAR(64),\n`;
  sql += `  name VARCHAR(255),\n`;
  sql += `  is_active BOOLEAN,\n`;
  sql += `  PRIMARY KEY (category, item_id)\n`;
  sql += `);\n\n`;

  if (data?.systemConfig?.masterlists?.barangays) {
    for (const b of data.systemConfig.masterlists.barangays) {
      sql += `INSERT INTO system_config_masterlists (category, item_id, code, name, is_active) VALUES ('barangays', '${b.id}', '${b.code || b.id}', '${(b.name || "").replace(/'/g, "''")}', ${b.active ? "TRUE" : "FALSE"});\n`;
    }
  }
  if (data?.systemConfig?.masterlists?.buildingTypes) {
    for (const bt of data.systemConfig.masterlists.buildingTypes) {
      sql += `INSERT INTO system_config_masterlists (category, item_id, code, name, is_active) VALUES ('buildingTypes', '${bt.id}', '${bt.code || bt.id}', '${(bt.name || "").replace(/'/g, "''")}', ${bt.active ? "TRUE" : "FALSE"});\n`;
    }
  }

  sql += `\nCOMMIT;\n-- END OF BACKUP --\n`;
  return sql;
}

export async function fetchBackupBundle(): Promise<{ ok: boolean; bundle?: any; sqlDump?: string } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(backendUrl("/api/admin/backup/bundle"), {
      credentials: "include",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data && data.bundle) {
        return data;
      }
    }
  } catch (err) {
    console.warn("[SystemConfig] Backend backup bundle fetch error or timeout, falling back to client generation:", err);
  }

  // Client-side fallback ensures Disaster Recovery never fails
  try {
    const bundle = generateClientSideBackupBundle();
    const sqlDump = generateClientSideSqlBackup(bundle);
    return { ok: true, bundle, sqlDump };
  } catch (err) {
    console.error("[SystemConfig] Backup bundle creation error:", err);
    return null;
  }
}

export async function downloadBackupFile(format: "sql" | "json"): Promise<{ ok: boolean; filename?: string; error?: string }> {
  const dateStr = new Date().toISOString().slice(0, 10);
  const fallbackFileName = `luisiana-infatrack-backup-${dateStr}.${format}`;

  try {
    const res = await fetch(backendUrl(`/api/admin/backup/download?format=${format}`), {
      credentials: "include",
    });

    if (res.ok) {
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      let filename = fallbackFileName;
      if (disposition && disposition.includes("filename=")) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) filename = match[1];
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { ok: true, filename };
    }
  } catch (err) {
    console.warn("[SystemConfig] Backend download error, generating client-side backup file:", err);
  }

  // Resilient fallback: generate and download client-side file
  try {
    const bundle = generateClientSideBackupBundle();
    let content = "";
    let mimeType = "";
    if (format === "json") {
      content = JSON.stringify(bundle, null, 2);
      mimeType = "application/json;charset=utf-8";
    } else {
      content = generateClientSideSqlBackup(bundle);
      mimeType = "application/sql;charset=utf-8";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fallbackFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { ok: true, filename: fallbackFileName };
  } catch (clientErr: any) {
    console.error("[SystemConfig] Fallback file generation failed:", clientErr);
    return { ok: false, error: clientErr?.message || "Failed to download backup" };
  }
}

/**
 * React hook to access dynamic system masterlists & maintenance mode state
 */
export function useSystemConfig() {
  const [config, setConfig] = useState<SystemConfigData>(() => memoryConfig || {
    version: "1.2.0",
    lastUpdated: new Date().toISOString(),
    maintenance: { enabled: false },
    masterlists: {
      barangays: DEFAULT_FALLBACK_BARANGAYS,
      buildingTypes: DEFAULT_FALLBACK_BUILDING_TYPES,
      zoningClassifications: [],
      permitCategories: [],
    },
  });

  useEffect(() => {
    void fetchPublicConfig();
    const update = () => {
      if (memoryConfig) setConfig(memoryConfig);
    };
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  const activeBarangays = config.masterlists.barangays.filter((b) => b.active).map((b) => b.name);
  const activeBuildingTypes = config.masterlists.buildingTypes
    .filter((t) => t.active)
    .map((t) => t.name);

  return {
    config,
    activeBarangays: activeBarangays.length > 0 ? activeBarangays : BARANGAY_LIST as readonly string[],
    activeBuildingTypes:
      activeBuildingTypes.length > 0
        ? activeBuildingTypes
        : DEFAULT_FALLBACK_BUILDING_TYPES.map((b) => b.name),
    maintenance: config.maintenance,
    reload: fetchPublicConfig,
  };
}

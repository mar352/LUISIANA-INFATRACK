import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../../data");
const CONFIG_FILE = path.join(DATA_DIR, "system-config.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const DEFAULT_BARANGAYS = [
  { id: "brgy-1", code: "ZONE-1", name: "Barangay Zone I (Poblacion)", zone: "Urban / Commercial Zone", active: true, isDefault: true },
  { id: "brgy-2", code: "ZONE-2", name: "Barangay Zone II (Poblacion)", zone: "Urban / Commercial Zone", active: true, isDefault: true },
  { id: "brgy-3", code: "ZONE-3", name: "Barangay Zone III (Poblacion)", zone: "Urban / Commercial Zone", active: true, isDefault: true },
  { id: "brgy-4", code: "ZONE-4", name: "Barangay Zone IV (Poblacion)", zone: "Urban / Commercial Zone", active: true, isDefault: true },
  { id: "brgy-5", code: "ZONE-5", name: "Barangay Zone V (Poblacion)", zone: "Urban / Commercial Zone", active: true, isDefault: true },
  { id: "brgy-6", code: "ZONE-6", name: "Barangay Zone VI (Poblacion)", zone: "Urban / Commercial Zone", active: true, isDefault: true },
  { id: "brgy-7", code: "ZONE-7", name: "Barangay Zone VII (Poblacion)", zone: "Urban / Commercial Zone", active: true, isDefault: true },
  { id: "brgy-8", code: "ZONE-8", name: "Barangay Zone VIII (Poblacion)", zone: "Urban / Commercial Zone", active: true, isDefault: true },
  { id: "brgy-9", code: "DELAPAZ", name: "De La Paz", zone: "Rural Zone", active: true, isDefault: true },
  { id: "brgy-10", code: "SAN-ANT", name: "San Antonio", zone: "Rural Zone", active: true, isDefault: true },
  { id: "brgy-11", code: "SAN-BUEN", name: "San Buenaventura", zone: "Rural Zone", active: true, isDefault: true },
  { id: "brgy-12", code: "SAN-DIEGO", name: "San Diego", zone: "Rural Zone", active: true, isDefault: true },
  { id: "brgy-13", code: "SAN-ISIDRO", name: "San Isidro", zone: "Rural Zone", active: true, isDefault: true },
  { id: "brgy-14", code: "SAN-JOSE", name: "San Jose", zone: "Rural Zone", active: true, isDefault: true },
  { id: "brgy-15", code: "SAN-JUAN", name: "San Juan", zone: "Rural Zone", active: true, isDefault: true },
  { id: "brgy-16", code: "SAN-LUIS", name: "San Luis", zone: "Rural Zone", active: true, isDefault: true },
  { id: "brgy-17", code: "SAN-PABLO", name: "San Pablo", zone: "Rural Zone", active: true, isDefault: true },
  { id: "brgy-18", code: "SAN-PEDRO", name: "San Pedro", zone: "Rural Zone", active: true, isDefault: true },
  { id: "brgy-19", code: "SAN-RAFAEL", name: "San Rafael", zone: "Rural Zone", active: true, isDefault: true },
  { id: "brgy-20", code: "SAN-ROQUE", name: "San Roque", zone: "Rural Zone", active: true, isDefault: true },
  { id: "brgy-21", code: "SAN-SALV", name: "San Salvador", zone: "Rural Zone", active: true, isDefault: true },
  { id: "brgy-22", code: "STO-DOM", name: "Santo Domingo", zone: "Rural Zone", active: true, isDefault: true },
  { id: "brgy-23", code: "STO-TOMAS", name: "Santo Tomas", zone: "Rural Zone", active: true, isDefault: true },
];

export const DEFAULT_BUILDING_TYPES = [
  { id: "bldg-1", code: "RESIDENTIAL", name: "Residential", desc: "Pabahay para sa pamilya (single-family, duplex)", active: true, isDefault: true },
  { id: "bldg-2", code: "APARTMENT", name: "Apartment", desc: "Apartment building o paupahang mga yunit", active: true, isDefault: true },
  { id: "bldg-3", code: "TOWNHOUSE", name: "Townhouse", desc: "Townhouse row o residential cluster", active: true, isDefault: true },
  { id: "bldg-4", code: "DORMITORY", name: "Dormitory", desc: "Dormitoryo, boarding house, o student housing", active: true, isDefault: true },
  { id: "bldg-5", code: "INSTITUTIONAL", name: "Institutional", desc: "Paaralan, kapilya/simbahan, o pasilidad ng gobyerno", active: true, isDefault: true },
  { id: "bldg-6", code: "COMMERCIAL", name: "Commercial", desc: "Tindahan, opisina, mall, restawran, o negosyo", active: true, isDefault: true },
  { id: "bldg-7", code: "INDUSTRIAL", name: "Industrial", desc: "Bodega, pagawaan, o pasilidad ng industriya", active: true, isDefault: true },
  { id: "bldg-8", code: "AGRO_INDUSTRIAL", name: "Agro-Industrial", desc: "Pasilidad pang-agrikultura tulad ng poultry, piggery, at feed/rice mill", active: true, isDefault: true },
];

export const DEFAULT_ZONING_CLASSIFICATIONS = [
  { id: "zone-1", code: "URBAN_COMMERCIAL", name: "Urban / Commercial Zone", desc: "Sentro ng kalakalan at kabayanan (Poblacion)", active: true, isDefault: true },
  { id: "zone-2", code: "RURAL_RESIDENTIAL", name: "Rural Zone", desc: "Pamayanang rural at pabahay", active: true, isDefault: true },
  { id: "zone-3", code: "AGRICULTURAL_FOREST", name: "Agricultural / Forest Zone", desc: "Lupaing pansakahan at watershed protection", active: true, isDefault: true },
  { id: "zone-4", code: "ECO_TOURISM", name: "Eco-Tourism Zone", desc: "Talon (falls) at protektadong kalikasan", active: true, isDefault: true },
];

export const DEFAULT_PERMIT_CATEGORIES = [
  { id: "pmt-1", code: "ZONING_CERT", name: "Zoning Certificate / Locational Clearance", desc: "Pagsusuri ng lokasyon alinsunod sa CLUP", active: true, isDefault: true },
  { id: "pmt-2", code: "BUILDING_PERMIT", name: "Building Permit Endorsement", desc: "Endorsement para sa Tanggapan ng Inhinyero", active: true, isDefault: true },
  { id: "pmt-3", code: "LAND_TITLING", name: "Land Titling / Tax Mapping Clearance", desc: "Pagsusuri ng titulo at tax declaration sa Assessor", active: true, isDefault: true },
  { id: "pmt-4", code: "OCCUPANCY_CERT", name: "Certificate of Occupancy Clearance", desc: "Pahintulot para sa paninirahan o operasyon", active: true, isDefault: true },
];

function createInitialConfig() {
  return {
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
      barangays: DEFAULT_BARANGAYS,
      buildingTypes: DEFAULT_BUILDING_TYPES,
      zoningClassifications: DEFAULT_ZONING_CLASSIFICATIONS,
      permitCategories: DEFAULT_PERMIT_CATEGORIES,
    },
  };
}

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      const initial = createInitialConfig();
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(initial, null, 2), "utf8");
      return initial;
    }
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw);
    let mutated = false;
    if (!parsed.masterlists) {
      parsed.masterlists = createInitialConfig().masterlists;
      mutated = true;
    }
    if (!parsed.maintenance) {
      parsed.maintenance = createInitialConfig().maintenance;
      mutated = true;
    }
    if (mutated) {
      saveConfig(parsed);
    }
    return parsed;
  } catch (err) {
    console.warn("[systemConfig] error reading json, resetting:", err.message);
    const initial = createInitialConfig();
    saveConfig(initial);
    return initial;
  }
}

function saveConfig(data) {
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("[systemConfig] error saving json:", err.message);
  }
}

let cachedConfig = loadConfig();

export function getSystemConfig() {
  cachedConfig = loadConfig();
  return cachedConfig;
}

export function getPublicConfig() {
  const cfg = getSystemConfig();
  return {
    maintenance: cfg.maintenance,
    masterlists: {
      barangays: (cfg.masterlists.barangays || []).filter((b) => b.active),
      buildingTypes: (cfg.masterlists.buildingTypes || []).filter((b) => b.active),
      zoningClassifications: (cfg.masterlists.zoningClassifications || []).filter((z) => z.active),
      permitCategories: (cfg.masterlists.permitCategories || []).filter((p) => p.active),
    },
    lastUpdated: cfg.lastUpdated,
  };
}

export function addConfigItem(category, itemData, author = "admin") {
  const cfg = getSystemConfig();
  if (!cfg.masterlists[category]) {
    return { ok: false, error: "invalid_category" };
  }
  const cleanName = String(itemData.name || "").trim();
  if (!cleanName) {
    return { ok: false, error: "name_required" };
  }

  // Check duplicates
  const exists = cfg.masterlists[category].some(
    (it) => it.name.toLowerCase() === cleanName.toLowerCase()
  );
  if (exists) {
    return { ok: false, error: "duplicate_name" };
  }

  const id = `${category.slice(0, 4)}-${Date.now()}`;
  const code = itemData.code
    ? String(itemData.code).trim().toUpperCase()
    : cleanName.toUpperCase().replace(/[^A-Z0-9]/g, "_").slice(0, 16);

  const newItem = {
    id,
    code,
    name: cleanName,
    desc: itemData.desc ? String(itemData.desc).trim() : "",
    zone: itemData.zone ? String(itemData.zone).trim() : undefined,
    active: true,
    isDefault: false,
    createdAt: new Date().toISOString(),
    createdBy: author,
  };

  cfg.masterlists[category].push(newItem);
  saveConfig(cfg);
  return { ok: true, item: newItem, category };
}

export function updateConfigItem(category, itemId, updates, author = "admin") {
  const cfg = getSystemConfig();
  if (!cfg.masterlists[category]) {
    return { ok: false, error: "invalid_category" };
  }
  const idx = cfg.masterlists[category].findIndex((it) => it.id === itemId);
  if (idx === -1) {
    return { ok: false, error: "item_not_found" };
  }

  const current = cfg.masterlists[category][idx];
  if (updates.name && updates.name.trim()) {
    current.name = updates.name.trim();
  }
  if (updates.desc !== undefined) {
    current.desc = String(updates.desc).trim();
  }
  if (updates.code !== undefined && updates.code.trim()) {
    current.code = String(updates.code).trim().toUpperCase();
  }
  if (updates.zone !== undefined) {
    current.zone = String(updates.zone).trim();
  }
  if (typeof updates.active === "boolean") {
    current.active = updates.active;
  }
  current.updatedAt = new Date().toISOString();
  current.updatedBy = author;

  cfg.masterlists[category][idx] = current;
  saveConfig(cfg);
  return { ok: true, item: current };
}

export function toggleConfigItemStatus(category, itemId, author = "admin") {
  const cfg = getSystemConfig();
  if (!cfg.masterlists[category]) {
    return { ok: false, error: "invalid_category" };
  }
  const item = cfg.masterlists[category].find((it) => it.id === itemId);
  if (!item) {
    return { ok: false, error: "item_not_found" };
  }
  item.active = !item.active;
  item.updatedAt = new Date().toISOString();
  item.updatedBy = author;
  saveConfig(cfg);
  return { ok: true, item };
}

export function deleteConfigItem(category, itemId) {
  const cfg = getSystemConfig();
  if (!cfg.masterlists[category]) {
    return { ok: false, error: "invalid_category" };
  }
  const idx = cfg.masterlists[category].findIndex((it) => it.id === itemId);
  if (idx === -1) {
    return { ok: false, error: "item_not_found" };
  }
  const [removed] = cfg.masterlists[category].splice(idx, 1);
  saveConfig(cfg);
  return { ok: true, removed };
}

export function resetCategoryToDefaults(category, author = "admin") {
  const cfg = getSystemConfig();
  const defaultsMap = {
    barangays: DEFAULT_BARANGAYS,
    buildingTypes: DEFAULT_BUILDING_TYPES,
    zoningClassifications: DEFAULT_ZONING_CLASSIFICATIONS,
    permitCategories: DEFAULT_PERMIT_CATEGORIES,
  };
  if (!defaultsMap[category]) {
    return { ok: false, error: "invalid_category" };
  }
  cfg.masterlists[category] = JSON.parse(JSON.stringify(defaultsMap[category]));
  cfg.lastUpdated = new Date().toISOString();
  saveConfig(cfg);
  return { ok: true, category, items: cfg.masterlists[category] };
}

export function setMaintenanceMode(enabled, message = "", estimatedDuration = "", author = "Super Admin") {
  const cfg = getSystemConfig();
  cfg.maintenance = {
    enabled: Boolean(enabled),
    message: message || "Pansamantalang inaayos ang LUISIANA INFA-TRACK system upang mapabuti ang serbisyo. Mangyaring bumalik mamaya.",
    estimatedDuration: estimatedDuration || "2 oras",
    updatedAt: new Date().toISOString(),
    updatedBy: author,
  };
  saveConfig(cfg);
  return { ok: true, maintenance: cfg.maintenance };
}

export function getMaintenanceMode() {
  const cfg = getSystemConfig();
  return cfg.maintenance || { enabled: false };
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 20260427;
const r = mulberry32(SEED);

const DEPTS = ["MPDC", "Engineering", "Agriculture", "Negosyo Center"];

let state = null;
let nextId = 100; // engineer-placed projects start from P100

function modelTypeToLegacyType(modelType) {
  if (!modelType) return "Private Building";
  if (["road", "bridge", "water_tank", "solar_farm"].includes(modelType)) return "Municipal Project";
  if (["barn"].includes(modelType)) return "Agricultural Structure";
  return "Private Building";
}

function jitter(n, amp) {
  return n + (r() - 0.5) * amp;
}

export function projectsSeed() {
  if (state) return state;

  const baseLat = 14.19;
  const baseLon = 121.51;

  const projects = Array.from({ length: 22 }).map((_, i) => {
    const status = i < 5 ? "Completed" : i < 16 ? "Ongoing" : "Planning";
    const progress = status === "Completed" ? 100 : status === "Planning" ? 0 : Math.round(20 + r() * 65);

    const nameKind = i % 3;
    const name =
      nameKind === 0 ? `Road Improvement Segment ${i + 1}` :
      nameKind === 1 ? `Barangay Waterline Upgrade ${i + 1}` :
                       `Agri Post-Harvest Facility ${i + 1}`;

    const modelType =
      nameKind === 0 ? "road" :
      nameKind === 2 ? "barn" :
                       "office";

    const type = modelTypeToLegacyType(modelType);

    return {
      id: `P${i + 1}`,
      name,
      modelType,
      type,
      department: DEPTS[i % DEPTS.length],
      status,
      progress,
      location: {
        lat: Number(jitter(baseLat, 0.12).toFixed(6)),
        lon: Number(jitter(baseLon, 0.14).toFixed(6)),
      },
      rotation: 0,
      updatedAt: new Date().toISOString(),
    };
  });

  state = projects;
  return state;
}

export function tickProjects() {
  const projects = projectsSeed();
  const now = new Date().toISOString();

  for (const p of projects) {
    if (p.status === "Ongoing") {
      const delta = 0.4 + r() * 1.2;
      p.progress = Math.min(100, Math.round((p.progress + delta) * 10) / 10);
      if (p.progress >= 100) {
        p.progress = 100;
        p.status = "Completed";
      }
      p.updatedAt = now;
    } else if (p.status === "Planning" && r() < 0.03) {
      p.status = "Ongoing";
      p.progress = Math.round(5 + r() * 10);
      p.updatedAt = now;
    }
  }

  return projects;
}

/**
 * Add a new engineer-placed project to the state.
 */
export function addProject({ name, modelType, type, department, location, rotation = 0, customModelUrl }) {
  const projects = projectsSeed();
  const id = `P${nextId++}`;
  const project = {
    id,
    name: name || `New ${modelType}`,
    modelType: modelType || "office",
    type: type || modelTypeToLegacyType(modelType),
    department: department || "Engineering",
    status: "Planning",
    progress: 0,
    location,
    rotation,
    customModelUrl,
    updatedAt: new Date().toISOString(),
  };
  projects.push(project);
  return project;
}

/**
 * Remove a project by ID. Returns true if removed.
 */
export function removeProject(id) {
  const projects = projectsSeed();
  const idx = projects.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  projects.splice(idx, 1);
  return true;
}

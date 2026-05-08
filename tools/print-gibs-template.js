const fs = require("fs");

const xml = fs.readFileSync(require("path").join(__dirname, "..", "capabilities.xml"), "utf8");
const layerId = process.argv[2] || "IMERG_Precipitation_Rate";

const layerRe = new RegExp(
  `<Layer>[\\s\\S]*?<ows:Identifier>${layerId}<\\/ows:Identifier>[\\s\\S]*?<\\/Layer>`,
  "i"
);
const m = xml.match(layerRe);
if (!m) {
  console.error("Layer not found:", layerId);
  process.exit(1);
}

const seg = m[0];
const formats = [...seg.matchAll(/<Format>([^<]+)<\/Format>/gi)].map((mm) => mm[1]);
const uniqFormats = [...new Set(formats)];

const templates = [...seg.matchAll(/<ResourceURL[^>]*template='([^']+)'/gi)].map((mm) => mm[1]);
const templates2 = [...seg.matchAll(/<ResourceURL[^>]*template="([^"]+)"/gi)].map((mm) => mm[1]);
const uniqTemplates = [...new Set([...templates, ...templates2])];

console.log("Layer:", layerId);
console.log("Formats:", uniqFormats.join(", "));
console.log("ResourceURL templates:");
for (const t of uniqTemplates.slice(0, 10)) console.log("-", t);


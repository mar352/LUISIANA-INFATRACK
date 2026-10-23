/**
 * INFA-TRACK Luisiana Internationalization (i18n) Engine
 * Supported Languages:
 *   - 'tl': Filipino / Tagalog (Default municipal locale)
 *   - 'en': English (Official international & technical locale)
 */

import { useState, useEffect } from "react";

export type Language = "tl" | "en";

const STORAGE_KEY = "infatrack-language";

export function getStoredLanguage(): Language | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "tl" || value === "en" ? value : null;
  } catch {
    return null;
  }
}

export function resolveLanguage(): Language {
  if (typeof window !== "undefined") {
    const urlLang = new URLSearchParams(window.location.search).get("lang");
    if (urlLang === "tl" || urlLang === "en") return urlLang;
  }
  const stored = getStoredLanguage();
  if (stored) return stored;
  return "tl";
}

/* ── Bilingual Phrase Pairs for Global DOM-Level Auto-Translation ───────────── */
export const PHRASE_PAIRS: [string, string][] = [
  // Full Titles & Headings
  ["Tanggapan ng Inhinyero at Pangangasiwa ng Gusali", "Office of the Municipal Engineer & Building Official"],
  ["Pangasiwaan ng Inhinyero (Executive Dashboard)", "Municipal Engineering Office (Executive Dashboard)"],
  ["Pangasiwaan ng Inhinyero", "Municipal Engineering Office"],
  ["Tanggapan ng Inhinyero", "Municipal Engineering Office"],
  ["TANGGAPAN NG INHINYERO", "MUNICIPAL ENGINEERING OFFICE"],
  ["Republika ng Pilipinas · Lalawigan ng Laguna", "Republic of the Philippines · Province of Laguna"],
  ["Mga Dokumento ng Inhinyero (Engineering Documents & Blueprints Vault)", "Engineering Documents & Blueprints Vault"],
  ["Subaybay sa mga Proyekto ng Bayan", "Municipal Infrastructure Projects Monitoring"],
  ["Iskedyul ng Ocular Field Inspections", "Ocular Field Inspection Schedules"],
  ["Iskedyul ng Ocular Site Inspection", "Ocular Site Inspection Schedules"],
  ["Direktoryo ng Kawani at Inhinyero", "Engineering Staff & Personnel Directory"],
  ["Roster ng Kawani at Inhinyero", "Engineering Staff & Personnel Roster"],
  ["Talaan ng mga kalsada, evacuation centers, at pampublikong gusali na pinangangasiwaan ng Tanggapan ng Inhinyero.", "Registry of roads, evacuation centers, and public infrastructure supervised by the Engineering Office."],
  ["Takdang araw at oras ng pagbisita ng mga Inhinyero sa lokasyon ng aplikante bago aprubahan ang konstruksyon.", "Designated dates and times for Engineer site visits prior to construction clearance."],
  ["Opisyal na talaan ng mga lisensyadong Civil Engineers, Building Inspectors, at GIS cartographers ng Munisipyo.", "Official roster of licensed Civil Engineers, Building Inspectors, and GIS specialists of the Municipality."],

  // Executive Command Center & Hero Banner
  ["● Executive Command Center · Tanggapan ng Inhinyero", "● Executive Command Center · Engineering Office"],
  ["● Executive Command Center · Municipal Engineering Office", "● Executive Command Center · Engineering Office"],
  ["Executive Command Center", "Executive Command Center"],
  ["Sentralisadong dashboard para sa pagsusuri ng mga natanggap na Opisyal na Resibo mula sa Assessor, pag-iiskedyul ng ocular inspection, at pre-construction coordinate pinning sa 3D Mapa ng Bayan ng Luisiana.", "Centralized dashboard for reviewing Official Receipts received from the Assessor, scheduling ocular inspections, and pre-construction coordinate pinning on the 3D Map of the Municipality of Luisiana."],
  ["Suriin ang Inspection Queue →", "Review Inspection Queue →"],
  ["Suriin ang Inspection Queue", "Review Inspection Queue"],
  ["I-pin sa 3D Mapa", "Pin to 3D Map"],
  ["Buksan ang 3D Mapa ↗", "Open 3D Map ↗"],
  ["Buksan ang 3D Mapa", "Open 3D Map"],
  ["Tingnan Lahat sa 3D Mapa ↗", "View All in 3D Map ↗"],
  ["Bukas sa Mapa ↗", "Open in Map ↗"],
  ["Tingnan sa Mapa", "View in Map"],
  ["I-fly sa 3D Mapa", "Fly in 3D Map"],
  ["3D GIS Mapa", "3D GIS Map"],
  ["3D Mapa", "3D Map"],

  // KPI Metrics & Geohazard Cards
  ["NAGHIHINTAY NG SITE INSPECTION", "AWAITING SITE INSPECTION"],
  ["Naghihintay ng Site Inspection", "Awaiting Site Inspection"],
  ["Nai-upload ang resibo mula sa Assessor; handa para sa ocular visit", "Receipt uploaded from Assessor; ready for ocular inspection"],
  ["NAKA-PIN SA 3D MAPA / APRUBADO", "PINNED ON 3D MAP / APPROVED"],
  ["Naka-pin sa 3D Mapa / Aprubado", "Pinned on 3D Map / Approved"],
  ["Na-inspeksyon at nabigyan ng clearance para sa konstruksyon", "Inspected and granted clearance for site construction"],
  ["RESIBO MULA SA ASSESSOR", "RECEIPTS FROM ASSESSOR"],
  ["Resibo mula sa Assessor", "Receipts from Assessor"],
  ["Kabuuang naitalang opisyal na patunay ng kabayaran", "Total official proof of payment records registered"],
  ["AKTIBONG PROYEKTO NG BAYAN", "ACTIVE MUNICIPAL INFRA PROJECTS"],
  ["Aktibong Proyekto ng Bayan", "Active Municipal Infra Projects"],
  ["Kasalukuyang ginagawang tulay, kalsada, at pasilidad", "Currently ongoing bridges, roads, and municipal facilities"],
  ["Mga Unang Nangangailangan ng Inspeksyon", "Priority Inspection Queue"],
  ["Nai-upload ang resibo at naghihintay ng pagbisita", "Receipt uploaded and awaiting ocular visit"],
  ["Geotechnical & Siting Overview", "Geotechnical & Siting Overview"],
  ["Bayan ng Luisiana Geohazard Monitoring (PHIVOLCS & MGB)", "Municipality of Luisiana Geohazard Monitoring (PHIVOLCS & MGB)"],
  ["Zoning & CLUP Compliance", "Zoning & CLUP Compliance"],
  ["98% Pagsunod", "98% Compliant"],
  ["Nakasunod sa tamang zoning classification ang mga isinusumiteng aplikasyon batay sa MPDC CLUP 2024–2034.", "Submitted applications strictly comply with municipal zoning classifications under the MPDC CLUP 2024–2034."],
  ["Rain-Induced Landslide Siting", "Rain-Induced Landslide Siting"],
  ["Mataas na Pag-iingat", "High Caution"],
  ["Ang mga barangay sa bulubunduking bahagi (San Isidro, San Salvador, De La Paz) ay nangangailangan ng slope protection plan bago mag-clearance.", "Upland barangays (San Isidro, San Salvador, De La Paz) require a certified slope protection plan prior to clearance."],
  ["Coordinate Pinning Engine", "Coordinate Pinning Engine"],
  ["Lahat ng naaprubahang aplikasyon ay awtomatikong inilalagay bilang 3D pin sa satellite globe upang maiwasan ang double-titling at boundary disputes.", "All approved applications are automatically pinned on the 3D satellite globe to prevent double-titling and boundary disputes."],

  // Sidebar Navigation & Headers
  ["PANGUNAHING MENU", "MAIN MENU"],
  ["Pangunahing Menu", "Main Menu"],
  ["Office of the Engineer", "Office of the Engineer"],
  ["Talaan ng Permits", "Permits Registry"],
  ["Mga Aplikasyon", "Permit Applications"],
  ["Pagpaplano ng Bayan", "Municipal Planning"],
  ["Pagpaplano", "Planning"],
  ["Mga Dokumento", "Documents"],
  ["Dokumento & Blueprints", "Documents & Blueprints"],
  ["Dokumento", "Documents"],
  ["Analitika at GIS", "Analytics & GIS"],
  ["Analitika", "Analytics"],
  ["Talaan ng Aktibidad", "Activity Log"],
  ["Tala ng Aktibidad", "Activity Log"],
  ["Activity Log", "Activity Log"],
  ["Pangasiwaan ng MPDC", "MPDC Admin"],
  ["MPDC Admin", "MPDC Admin"],
  ["Pangasiwaan ng Sistema", "Admin Panel"],
  ["Admin Panel", "Admin Panel"],
  ["Command Center", "Command Center"],
  ["Site Inspections", "Site Inspections"],
  ["Proyekto ng Bayan", "Municipal Projects"],
  ["Iskedyul ng Ocular", "Ocular Schedules"],
  ["Kawani at Inhinyero", "Staff & Engineers"],
  ["Mabilis na Ugnayan", "Quick Links"],
  ["Mga Modyul ng Inhinyero", "Engineering Modules"],
  ["Real-time Live Sync", "Real-time Live Sync"],
  ["INHINYERO LUISIANA", "ENGINEERING LUISIANA"],
  ["MPDC LUISIANA", "MPDC LUISIANA"],

  // Inspection Queue & Details
  ["Hanapin ayon sa Tracking Reference, Pangalan, O.R. Blg., o Barangay...", "Search by Tracking Reference, Name, O.R. No., or Barangay..."],
  ["Maghanap sa Tracking ID, Pangalan, O.R. #, o Barangay...", "Search by Tracking ID, Name, O.R. #, or Barangay..."],
  ["Maghanap ayon sa Tracking Ref, Aplikante, O.R. Number, o Proyekto...", "Search by Tracking Ref, Applicant, O.R. Number, or Project..."],
  ["Kinukuha ang mga talaan ng aplikasyon at resibo mula sa database...", "Fetching applications and receipts from database..."],
  ["Walang Natagpuang Aplikasyon", "No Applications Found"],
  ["Walang Natagpuang Dokumento", "No Documents Found"],
  ["Walang tumutugma sa kasalukuyang filter o search term.", "No applications match your current filter or search criteria."],
  ["Wala pang aplikasyon na nakapag-upload ng resibo mula sa Assessor sa ngayon.", "No applications have uploaded receipts from the Assessor yet."],
  ["Walang nakabinbing aplikasyon para sa site inspection sa ngayon.", "No applications awaiting site inspection at this moment."],
  ["Walang nakatalang proyekto sa kasalukuyan.", "No infrastructure projects currently registered."],
  ["Isinumite:", "Submitted:"],
  ["✓ Naka-pin sa 3D Mapa", "✓ Pinned on 3D Map"],
  ["⚠ Naka-Hold / Ibinalik", "⚠ On Hold / Returned"],
  ["● Naghihintay ng Clearance", "● Awaiting Clearance"],
  ["✓ Naka-pin", "✓ Pinned"],
  ["Naghihintay", "Pending"],
  ["Naka-Hold", "On Hold"],
  ["Naka-pin", "Pinned"],
  ["Aplikante & Lokasyon", "Applicant & Location"],
  ["Aplikante & Tracking Ref", "Applicant & Tracking Ref"],
  ["Aplikante & Dossier", "Applicant & Dossier"],
  ["Kategorya & Lokasyon", "Category & Location"],
  ["Ipinapanukalang Gusali", "Proposed Building"],
  ["Uri ng Gusali", "Building Type"],
  ["Halaga:", "Estimated Cost:"],
  ["Dahilan ng Pagka-Hold:", "Hold Reason:"],
  ["OFFICIAL RECEIPT (MULA SA ASSESSOR):", "OFFICIAL RECEIPT (FROM ASSESSOR):"],
  ["Opisyal na Resibo (Assessor)", "Official Receipt (Assessor)"],
  ["Opisyal na Resibo (O.R.)", "Official Receipt (O.R.)"],
  ["Opisyal na Resibo O.R.", "Official Receipt O.R."],
  ["Opisyal na Resibo", "Official Receipt"],
  ["Resibo ng Bayad (O.R.)", "Official Receipt (O.R.)"],
  ["Resibo ng Bayad", "Proof of Payment"],
  ["Nai-record mula sa Assessor", "Recorded from Assessor"],
  ["Tingnan ang Resibo", "View Receipt"],
  ["Suriin ang Resibo", "Verify Receipt"],
  ["Walang Resibo", "No Receipt"],
  ["May Resibo", "With Receipt"],
  ["Naaprubahan", "Approved"],
  ["Kasamang Dokumento:", "Attached Documents:"],
  ["Mga Dokumento / Plano", "Documents / Plans"],
  ["Status ng Engineering", "Engineering Status"],
  ["Katayuan ng Engineering", "Engineering Status"],
  ["Mga Dokumento & Aksyon", "Documents & Actions"],
  ["Itakda ang Inspeksyon", "Schedule Inspection"],
  ["Aprubahan at I-pin", "Approve & Pin"],
  ["I-Hold / Ibalik", "Hold / Return"],
  ["I-hold / Ibalik", "Hold / Return"],
  ["Subukang Muli", "Retry"],
  ["Tingnan Lahat", "View All"],
  ["Suriin", "Review"],
  ["Detalye", "Details"],
  ["Itago", "Hide"],
  ["BERIPIKADO", "VERIFIED"],

  // Vault KPIs & Filter Pills
  ["Kabuuang Dossiers", "Total Dossiers"],
  ["Aplikasyong may rekord", "Applications on record"],
  ["Katibayan ng bayad", "Proof of payment"],
  ["Blueprints & Plans", "Blueprints & CAD"],
  ["Blueprints & CAD", "Blueprints & CAD"],
  ["Arkitektura at istruktura", "Architectural & structural"],
  ["Teknikal na plano", "Technical plans"],
  ["Sertipikasyon ng Inhinyero", "Engineering Clearances"],
  ["Mga Clearance", "Clearances"],
  ["Naaprubahan sa site inspection", "Approved on site inspection"],
  ["Barangay & Zoning", "Barangay & Zoning"],
  ["Lahat ng Dokumento", "All Documents"],
  ["Engineering Clearances", "Engineering Clearances"],
  ["Barangay Clearance", "Barangay Clearance"],
  ["Zoning Endorsements", "Zoning Clearance"],
  ["Zoning Clearance", "Zoning Clearance"],

  // Modals & Action Dialogs
  ["Aprubahan at I-pin sa 3D Mapa", "Approve & Pin to 3D Map"],
  ["Oo, Aprubahan at I-pin sa 3D Mapa", "Yes, Approve & Pin to 3D Map"],
  ["I-hold at Ibalik ang Aplikasyon", "Hold & Return Application"],
  ["Kumpirmahin ang Pag-Hold", "Confirm Hold"],
  ["Magtakda ng Ocular Site Inspection", "Schedule Ocular Site Inspection"],
  ["Field Visit para sa Pagsusuri ng Lupa at Resibo", "Field Visit for Land Boundary & Receipt Verification"],
  ["Itakda ang Iskedyul", "Schedule Inspection"],
  ["+ Magtakda ng Bagong Iskedyul", "+ Schedule New Inspection"],
  ["+ Magtakda ng Bagong Inspeksyon", "+ Schedule New Inspection"],
  ["Pumili ng Preset na Dahilan o Mag-type:", "Select Preset Reason or Type Reason:"],
  ["Opisyal na Notes ng Municipal Engineer:", "Official Notes of the Municipal Engineer:"],

  // Landing Page - Hero, Showcase & CTAs
  ["Live · Bayan ng Luisiana, Laguna", "Live · Municipality of Luisiana, Laguna"],
  ["Live · Bayan ng Luisiana", "Live · Municipality of Luisiana"],
  ["Tumpak na GIS & Ligtas sa Sakunang Pagpaplano", "Precision GIS & Disaster-Resilient Siting"],
  ["Nagbibigay-kapangyarihan sa mga inhinyero, tagaplano, at mamamayan ng Luisiana na magtayo sa mas ligtas na lupain — tampok ang real-time 3D terrain intelligence, hazard risk analytics, at ugnayan ng mga kagawaran.", "Empowering Luisiana's municipal engineers, planners, and citizens to build on safer ground — featuring real-time 3D terrain intelligence, hazard risk analytics, and inter-departmental workflows."],
  ["Magsimula ng Bagong Aplikasyon", "Start New Application"],
  ["Buksan ang Pampublikong Portal", "Open Public Portal"],
  ["Pampublikong Portal", "Public Portal"],
  ["Subaybayan ang Katayuan ng Permit", "Track Permit Status"],
  ["Subaybayan ang Permit", "Track Permit"],
  ["Pag-login ng Kagawaran →", "Department Sign In →"],
  ["Pag-login ng Kagawaran", "Department Sign In"],
  ["Stadia GIS Mapa", "Stadia GIS Map"],
  ["Tingnan ang Drone Aerial Video", "View Drone Aerial Video"],
  ["Drone Aerial Video", "Drone Aerial Video"],
  ["Drone Video", "Drone Video"],
  ["Mga Sakop na Barangay", "Barangays Covered"],
  ["Mga Tanggapan ng Munisipyo", "Municipal Offices"],
  ["Cesium 3D Terrain Globe", "Cesium 3D Terrain Globe"],
  ["Cesium Terrain Globe", "Cesium Terrain Globe"],
  ["Mga Hazard Feed ng PHIVOLCS & MGB", "PHIVOLCS & MGB Hazard Feeds"],
  ["Itinayo para sa Pag-unlad ng Bayan ng Luisiana", "Built for where Luisiana builds"],
  ["Isang pinag-isang sistemang heograpikal na nag-uugnay sa mga kahilingan mula sa komunidad, pagsusuring heoteknikal, at ebalwasyon ng inhinyeriya.", "A unified spatial system linking field requests, geotechnical evaluation, and engineering review."],
  ["3D Globe ng Munisipyo", "3D Municipal Globe"],
  ["Tuklasin ang Luisiana gamit ang street-level Cesium terrain, imahe mula sa satellite, 3D paglalagay ng estruktura, at zoning overlay ng 23 barangay.", "Explore Luisiana with street-level Cesium terrain, satellite imagery, 3D structure placement, and 23 barangay zoning overlays."],
  ["Pagtatasa ng Panganib sa Lokasyon", "Siting Risk Assessment"],
  ["Pagtatasa sa Panganib ng Siting", "Hazard Risk Siting Assessment"],
  ["Suriin ang anumang koordinato sa loob ng bayan laban sa pagyanig mula sa lindol ng PHIVOLCS, pagguho ng lupa dulot ng ulan, at baha.", "Evaluate any pin inside the municipality against historical PHIVOLCS ground shaking, rain-induced landslides, and flood thresholds."],
  ["Suriin ang anumang koordinato para sa baha, pagguho ng lupa dulot ng ulan, PEIS, at pagyanig ng PHIVOLCS bago magtayo.", "Evaluate any coordinate for flood, rain-induced landslide, PEIS, and PHIVOLCS 2014 ground shaking before construction."],
  ["Pagsubaybay sa Imprastraktura", "Infrastructure Tracking"],
  ["Sentralisadong talaan ng ari-arian ng munisipyo na may arkibo ng blueprint, larawan ng ocular inspection, progreso ng kontratista, at mga alerto.", "Centralized municipal asset registry with blueprint archives, field inspection photos, contractor milestones, and real-time alerts."],
  ["I-pin, ilagay, at subaybayan ang imprastraktura ng munisipyo na may live na progreso, blueprints, at tala ng inspektor.", "Pin, place, and monitor municipal infrastructure with live progress milestones, blueprints, and inspector logs."],
  ["Lupon sa Pagpaplano at Zoning", "Planning & Zoning Board"],
  ["Mga panukala ng barangay na sinusuri gamit ang spatial intelligence para sa MPDC review upang mapabilis ang pag-apruba sa ligtas na pasilidad.", "Barangay proposals scored with spatial intelligence for MPDC review, streamlining approvals for safe, compliant facilities."],
  ["Pagpaplanong Matatag sa Sakuna", "Disaster-Resilient Planning"],
  ["Mga kahilingan sa proyekto ng barangay na sinusuri batay sa mga hadlang sa heoteknikal para sa zoning ng MPDC at ebalwasyon ng inhinyero.", "Barangay project requests scored against geotechnical constraints for MPDC zoning and engineering review."],
  ["Direktang Pag-upload ng O.R. ng Mamamayan", "Direct Citizen O.R. Upload"],
  ["Direktang nag-a-upload ang mga aplikante ng opisyal na resibo para sa mabilisang beripikasyon at pag-iskedyul ng inspeksyon ng inhinyero.", "Applicants directly upload official receipts for instant verification and engineering inspection routing."],
  ["Ugnayan ng mga Kagawaran ng Pamahalaan", "Inter-Departmental Governance"],
  ["Mga nakatalagang workspace batay sa tungkulin para sa maayos na daloy ng trabaho at pananagutan.", "Role-scoped workspaces tailored to municipal workflows and accountability."],
  ["Awtorisadong Kawani", "Authorized Staff"],
  ["Aktibong Tungkulin", "Active Role"],
  ["Handa ka na bang sumuri o magplano?", "Ready to explore or plan?"] ,
  ["Buksan ang pampublikong portal para sa mapa at mga kasalukuyang proyekto — o mag-login sa iyong tanggapan upang suriin ang mga lokasyon at magbigay ng permiso.", "Open the public portal for interactive map layers and ongoing projects — or sign in to your department workspace to review sites and issue permits."],
  ["Tungkol sa Sistema", "About System"],
  ["Pangkalahatan", "Overview"],
  ["Mga Tampok & Kakayahan", "Capabilities"],
  ["Mga Tampok & Arkitektura", "Features & Architecture"],
  ["Mga Kagawaran", "Departments"],
  ["Panganib sa Sakuna", "Geohazard Risk"],
  ["Panganib sa Lokasyon", "Risk Siting"],
  ["Tungkol sa Luisiana", "About Luisiana"],
  ["Tungkol", "About"],
  ["Pangunahing Kakayahan ng Munisipyo", "Core Municipal Capabilities"],
  ["Mga kagamitang spatial para sa pagtatasa ng lokasyon, pamamahala ng ari-arian, at pagpapagaan ng panganib.", "Purpose-built spatial tools for site evaluation, asset management, and risk mitigation."],
  ["Mga Workspace ng Kagawaran", "Department Workspaces"],
  ["Tungkulin batay sa pag-access na idinisenyo upang matiyak na ang bawat tanggapan ay nakikita ang kailangan para sa mabilisang aksyon.", "Role-based access designed to ensure each office sees exactly what is needed for swift action."],
  ["Klasipikasyon ng Panganib sa Lokasyon", "Siting Risk Classification"],
  ["Ang bawat pin sa Luisiana ay sinusuri laban sa mahigpit na geological at meteorological indicators.", "Every pin in Luisiana is evaluated against rigorous geological and meteorological indicators."],
  ["Mataas na Panganib", "High Risk"],
  ["Katamtamang Panganib", "Moderate Risk"],
  ["Ligtas / Mababang Panganib", "Safe / Low Risk"],
  ["Iwasan kung maaari — Nangangailangan ng Mitigasyon", "Avoid if possible — Requires Mitigation"],
  ["Matatarik na dalisdis o kalapitan sa fault line. Ang anumang konstruksyon dito ay nangangailangan ng komprehensibong pag-aaral sa lupa, soil stabilization, at reinforced structural calculations.", "Steep slopes or earthquake-prone fault proximity. Any development here requires comprehensive geotechnical study, soil stabilization, and reinforced structural calculations."],
  ["Maaaring Tayuan nang may Pag-iingat ng Inhinyero", "Buildable with Engineering Controls"],
  ["Katamtamang dalisdis o kondisyon sa kanal. Sinusuri ng MPDC at Municipal Engineers ang drainage, retaining wall, at lalim ng pundasyon bago aprubahan.", "Moderate slope or drainage constraints. MPDC and Municipal Engineers review elevation drainage, retaining measures, and foundation depth before approval."],
  ["Pangunahing Lokasyon para sa Imprastraktura", "Preferred Ground for Infrastructure"],
  ["Matatag na lupain na may mababang panganib sa liquefaction at pagguho. Angkop para sa mga paaralan, evacuation center, at gusali ng pamahalaan.", "Stable terrain with minimal liquefaction and slope failure vulnerability. Preferred for schools, evacuation centers, and civic buildings."],
  ["Pinagmumulan ng Datos sa Geotechnical at Panganib", "Geotechnical & Hazard Data Sources"],
  ["Tungkol sa Sistemang INFA-TRACK", "About the INFA-TRACK System"],
  ["Makabagong spatial infrastructure intelligence para sa Bayan ng Luisiana, Laguna.", "Modern spatial infrastructure intelligence for the Municipality of Luisiana, Laguna."],
  ["Itinatag para sa Matatag na Pamamahala ng Bayan", "Built for Resilient Municipal Governance"],
  ["Ang INFA-TRACK ay ang municipal GIS at infrastructure tracking platform para sa lokal na pamahalaan ng Luisiana, Laguna. Pinapalitan nito ang hiwa-hiwalay na mga papeles ng isang nagkakaisang 3D geospatial environment.", "INFA-TRACK is the municipal GIS and infrastructure tracking platform developed for the local government unit of Luisiana, Laguna. It replaces fragmented paper files with a single, collaborative 3D geospatial environment."],
  ["Sa pamamagitan ng pag-uugnay sa mga tagaplano ng MPDC, inhinyero ng munisipyo, at mga kapitan ng barangay sa isang interaktibong mapa, sinisiguro ng sistema na ang bawat pondo ng bayan ay napupunta sa ligtas at matatag na lokasyon.", "By connecting MPDC planners, municipal engineers, and barangay captains on one interactive terrain globe, the system ensures that every peso of public investment is sited on safe, resilient ground."],
  ["Munisipalidad", "Municipality"],
  ["Munisipyo", "Municipality"],
  ["Lalawigan", "Province"],
  ["Rehiyon", "Region"],
  ["Klasipikasyon", "Classification"],
  ["Mga Barangay", "Barangays"],
  ["Pangunahing GIS", "GIS Core"],
  ["Mga Layer ng Panganib", "Hazard Layers"],
  ["Implementasyon", "Deployment"],
  ["Ika-4 na Klaseng Munisipalidad", "4th Class Municipality"],
  ["23 Lokal na Barangay", "23 Local Barangays"],

  // Login Modal
  ["Mag-sign In sa INFA-TRACK", "Sign In to INFA-TRACK"],
  ["Mag-login sa INFA-TRACK", "Sign In to INFA-TRACK"],
  ["I-access ang workspace ng iyong tanggapan", "Access your municipal department workspace"],
  ["Account sa Tanggapan / Username", "Department Account / Username"],
  ["Mag-sign In sa Dashboard", "Sign In to Dashboard"],
  ["Mag-login sa Dashboard", "Sign In to Dashboard"],
  ["Sinusuri ang impormasyon...", "Verifying credentials..."],
  ["Mga Awtorisadong Tungkulin", "Authorized Roles"],
  ["← Bumalik sa Pangkalahatan", "← Back to Overview"],
  ["Bumalik sa Pangkalahatan", "Back to Overview"],
  ["Maling username o password.", "Invalid username or password."],
  ["Nabigo ang pag-login. Suriin ang koneksyon at subukan muli.", "Sign-in failed. Check your connection and try again."],
  ["Kasalukuyang naka-lock ang account dahil sa sunud-sunod na maling pagsubok.", "Account locked after too many failed attempts."],

  // Applicant Tracking & Stepper
  ["1. Pag-apruba sa MPDC Zoning", "1. MPDC Zoning Approval"],
  ["2. Pag-upload ng Resibo ng Kliyente (O.R.)", "2. Client Uploads Receipt (O.R.)"],
  ["3. Ocular Inspection ng Inhinyero", "3. Engineering Site Inspection"],
  ["MPDC at Lupon sa Zoning", "MPDC & Zoning Board"],
  ["Portal ng Aplikante · Patunay ng Bayad", "Applicant Portal · Proof of Payment"],
  ["Direktang Paglakip ng O.R. ng Aplikante", "Direct Applicant O.R. Attachment"],
  ["Tanggapan ng Inhinyero ng Munisipyo", "Municipal Engineering Office"],
  ["Clearance sa Gusali at Pag-pin sa Mapa", "Building Clearance & Pinning"],
  ["Subaybayan ang Iyong Permit", "Track Your Permit"],
  ["Ilagay ang iyong 9-digit na Tracking Number (hal. LUI-2026-0001)", "Enter your 9-digit Tracking Number (e.g. LUI-2026-0001)"],
  ["Subaybayan Ngayon", "Track Now"],

  // Citizen Portal & New Application
  ["Residensyal", "Residential"],
  ["Pabahay para sa Pamilya", "Family Housing"],
  ["Paupahang Gusali / Multi-Unit", "Rental Building / Multi-Unit"],
  ["Row House / Cluster", "Row House / Cluster"],
  ["Boarding House / Transient", "Boarding House / Transient"],
  ["Komersyal", "Commercial"],
  ["Industriyal", "Industrial"],
  ["Agrikultura", "Agriculture"],
  ["Agro-Industriyal", "Agro-Industrial"],
  ["Institusyonal", "Institutional"],

  // General Shared Words
  ["Lahat ng Barangay", "All Barangays"],
  ["Lahat ng Katayuan", "All Statuses"],
  ["Lahat ng Dokumento", "All Documents"],
  ["Walang Natagpuan", "None Found"],
  ["Walang Natagpuang Aplikasyon", "No Applications Found"],
  ["Walang Natagpuang Dokumento", "No Documents Found"],
  ["Subukang Muli", "Retry"],
  ["Suriin", "Review"],
  ["Detalye", "Details"],
  ["Itago", "Hide"],
  ["BERIPIKADO", "VERIFIED"],
  ["Beripikado", "Verified"],
  ["Naaprubahan", "Approved"],
  ["Naghihintay", "Pending"],
  ["Naka-Hold", "On Hold"],
  ["Naka-pin", "Pinned"],
  ["Kanselahin", "Cancel"],
  ["I-save", "Save"],
  ["Isumite", "Submit"],
  ["Lumabas", "Sign Out"],
  ["Mag-sign Out", "Sign Out"],
  ["Mag-sign In", "Sign In"],
  ["Bumalik", "Go Back"],
  ["Maghanap...", "Search..."],
  ["Katayuan", "Status"],
  ["Mga Aksyon", "Actions"],
  ["Aksyon", "Action"],
  ["Petsa", "Date"],
  ["Aplikante", "Applicant"],
  ["Barangay", "Barangay"],
  ["Gusali:", "Building:"],
  ["Gusali", "Building"],
  ["Badyet", "Budget"],
  ["Inhinyero / Kontratista", "Engineer / Contractor"],
  ["Kabuuang Pagsulong", "Overall Progress"],
  ["Ina-aprubahan...", "Approving..."],
  ["Inilalagay sa hold...", "Holding..."],
  ["Ikinakarga...", "Loading..."],

  // ── Modal Phrases & Sentences ──
  ["I-hold at Ibalik ang Aplikasyon sa Kliyente", "Hold and Return Application to Client"],
  ["Kumpirmahin ang Pag-apruba at Pag-pin", "Confirm Approval and Map Pinning"],
  ["Oo, Aprubahan at I-pin sa Mapa", "Yes, Approve & Pin on Map"],
  ["Kumpirmahin ang Pag-Hold at Ibalik", "Confirm Hold and Return"],
  ["Pumili ng Karaniwang Dahilan (I-click para mailagay sa tala):", "Select Common Reason (Click to add to notes):"],
  ["Opisyal na Dahilan ng Pag-Hold / Mga Dapat Ayusin ng Aplikante:", "Official Hold Reason / Applicant Deficiencies:"],
  ["Sine-save ang Hold...", "Saving Hold..."],
  ["Isulat ang eksaktong detalye o mga kailangang i-revise ng aplikante bago maaprubahan ang clearance...", "Specify the exact details or required revisions before clearance can be approved..."],
  ["Opisyal na Remarks / Tala ng Engineer:", "Official Engineer Remarks / Notes:"],
  ["Halimbawa: Naaprubahan batay sa isinumiteng structural plans. Handa na para sa Before Construction ocular inspection...", "Example: Approved based on submitted structural plans. Ready for Before Construction ocular inspection..."],
  ["Itakda ang Iskedyul ng Inspeksyon", "Set Inspection Schedule"],
  ["Petsa ng Inspeksyon", "Inspection Date"],
  ["Oras ng Inspeksyon", "Inspection Time"],
  ["Itinalagang Inhinyero / Tagasuri", "Assigned Engineer / Inspector"],
  ["I-save ang Iskedyul", "Save Schedule"],
  ["Sine-save ang Iskedyul...", "Saving Schedule..."],
  ["Isara ang Dokumento", "Close Document"],
  ["I-update ang Ocular Inspection", "Update Ocular Inspection"],
  ["Yugto ng Konstruksyon (Stage)", "Construction Stage"],
  ["Bago Magtayo (0%)", "Before Construction (0%)"],
  ["Habang Nagtatayo (50%)", "During Construction (50%)"],
  ["Tapos na ang Proyekto (100%)", "Project Completed (100%)"],
  ["Mga Larawan sa Field (Geotagged)", "Field Photos (Geotagged)"],
  ["Pindutin upang mag-upload ng larawan", "Click to upload photo"],
  ["Mga Obserbasyon sa Field:", "Field Observations:"],
  ["I-save ang Ulat ng Inspeksyon", "Save Inspection Report"],
  ["Sine-save ang Ulat...", "Saving Report..."],
  ["Kumpirmahin ang 100% Pagkumpleto", "Confirm 100% Completion"],
  ["Ang proyektong ito ay mamarkahan bilang ganap na tapos.", "This project will be marked as fully completed."],
  ["Oo, Tapusin ang Proyekto", "Yes, Complete Project"],
  ["Suriin ang Zoning Application:", "Review Zoning Application:"],
  ["Pangalan ng Aplikante", "Applicant Name"],
  ["Kasalukuyang Status", "Current Status"],
  ["Opisyal na Tala ng MPDC Reviewer:", "Official Notes of MPDC Reviewer:"],
  ["Maglagay ng komento para sa ocular site inspection o zoning compliance...", "Enter notes for ocular site inspection or zoning compliance..."],
  ["Itakda sa Ocular Site Visit (Hakbang 2)", "Set to Ocular Site Visit (Step 2)"],
  ["Aprubahan ang Zoning Clearance", "Approve Zoning Clearance"],
  ["Magrehistro ng Bagong Kawani ng MPDC", "Register New MPDC Staff"],
  ["Magdagdag ng opisyal, urban planner, o field ocular inspector sa direktoryo ng tanggapan.", "Add an officer, urban planner, or field ocular inspector to the office directory."],
  ["Pangalan ng Kawani *", "Staff Full Name *"],
  ["Opisyal na Posisyon", "Official Position"],
  ["Katungkulan / Role", "Designation / Role"],
  ["Telepono / Mobile Contact", "Phone / Mobile Contact"],
  ["Panimulang Katayuan (Status)", "Initial Status"],
  ["In Office (Nasa Tanggapan)", "In Office"],
  ["On Field (Nasa Inspeksyon)", "On Field"],
  ["Active (Aktibo)", "Active"],
  ["Mga Nakatalagang Barangay", "Assigned Barangays"],
  ["Lahat (All 23)", "All (All 23)"],
  ["Poblacion Zones", "Poblacion Zones"],
  ["Alisin Lahat", "Clear All"],
  ["Lahat ng 23 Barangay", "All 23 Barangays"],
  ["Bigyan ng Opisyal na Login Account sa INFA-TRACK (Role: MPDC)", "Grant Official INFA-TRACK Login Account (Role: MPDC)"],
  ["Default Password", "Default Password"],
  ["Idinaragdag...", "Adding..."],
  ["Idagdag bilang Kawani", "Add as Staff Member"],
  ["Magrehistro ng Bagong Kawani", "Register New Employee"],
  ["Buong Pangalan ng Empleyado", "Employee Full Name"],
  ["Employee ID / Serial No.", "Employee ID / Serial No."],
  ["Tanggapan at Tungkulin (Role)", "Office & Role"],
  ["Pansamantalang Password", "Temporary Password"],
  ["Mag-create ng Account", "Create Account"],
  ["Buod ng Bagong Account", "New Account Summary"],
  ["I-kopya ang Mga Detalye", "Copy Details"],
  ["Tapos na", "Done"],
  ["Palitan ang Default Password", "Change Default Password"],
  ["Kinakailangan ang Pagpapalit ng Password", "Password Change Required"],
  ["Bagong Password", "New Password"],
  ["Kumpirmahin ang Bagong Password", "Confirm New Password"],
  ["Mahina", "Weak"],
  ["Katamtaman", "Medium"],
  ["Malakas", "Strong"],
  ["I-update ang Password at Magpatuloy", "Update Password & Proceed"],
  ["Impormasyon ng Lupa at May-ari", "Land & Property Information"],
  ["Sukat ng Lupa:", "Lot Area:"],
  ["Address / Palatandaan:", "Address / Landmark:"],
  ["Katayuan ng Permiso ng Pamahalaan", "Regulatory Permitting Status"],
  ["Katayuan ng MEO Building Permit:", "MEO Building Permit Status:"],
  ["Naiisyu ang Building Permit", "Building Permit Issued"],
  ["Naghihintay ng Pagsusuri ng Inhenyero", "Pending Engineering Evaluation"],
  ["Mga Tala ng Opisyal ng LGU:", "LGU Officer Notes:"],
  ["Mag-upload ng Bagong Plano", "Upload New Plan"],
  ["PREVIEW NG SIDE PHOTO", "SIDE PHOTO PREVIEW"],
  ["Yugto:", "Stage:"],
  ["◀ Nakaraang Larawan", "◀ Previous Photo"],
  ["Susunod na Larawan ▶", "Next Photo ▶"],
  ["Palakihin (+)", "Zoom In (+)"],
  ["Paliitin (-)", "Zoom Out (-)"],
  ["I-fit sa screen", "Fit to screen"],
  ["I-rotate", "Rotate"],
  ["I-reset", "Reset"],
  ["Direktang I-download ang File", "Direct File Download"],
  ["Hindi ma-preview ang format ng file na ito sa loob ng browser.", "This file format cannot be previewed in-browser."],
  ["Tulong sa INFA-TRACK", "INFA-TRACK Help"],
  ["Tulong ng AI sa INFA-TRACK", "INFA-TRACK AI Help Chat"],
  ["Magtanong tungkol sa proyektong ito…", "Ask about this project…"],
  ["Kasalukuyang password", "Current password"],
  ["Palitan ang password", "Change password"],
];

/* ── DOM Auto-Translation Engine ───────────────────────────────────────────── */
let domObserver: MutationObserver | null = null;
let debounceTimer: any = null;
let isTranslating = false;

// Pre-sorted arrays for optimal length-descending substitution
let sortedPairsForEn: [string, string][] | null = null;
let sortedPairsForTl: [string, string][] | null = null;

function getSortedPairs(isEn: boolean): [string, string][] {
  if (isEn) {
    if (!sortedPairsForEn) {
      sortedPairsForEn = [...PHRASE_PAIRS].sort((a, b) => b[0].length - a[0].length);
    }
    return sortedPairsForEn;
  } else {
    if (!sortedPairsForTl) {
      sortedPairsForTl = [...PHRASE_PAIRS].sort((a, b) => b[1].length - a[1].length);
    }
    return sortedPairsForTl;
  }
}

export function translateString(val: string, isEn: boolean): string {
  if (!val || !val.trim()) return val;
  const pairs = getSortedPairs(isEn);
  let updated = val;
  for (const [tl, en] of pairs) {
    if (isEn) {
      if (updated.includes(tl)) {
        updated = updated.split(tl).join(en);
      }
    } else {
      if (updated.includes(en)) {
        updated = updated.split(en).join(tl);
      }
    }
  }
  return updated;
}

export function runDomTranslation(lang: Language) {
  if (typeof document === "undefined" || !document.body || isTranslating) return;
  isTranslating = true;
  if (domObserver) {
    domObserver.disconnect();
  }
  const isEn = lang === "en";

  try {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toLowerCase();
          if (
            tag === "script" ||
            tag === "style" ||
            tag === "textarea" ||
            tag === "input" ||
            tag === "code" ||
            parent.closest(".lang-btn-opt") ||
            parent.closest(".infatrack-lang-toggle")
          ) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    let node: Node | null;
    while ((node = walker.nextNode())) {
      const val = node.nodeValue;
      if (!val || !val.trim()) continue;
      const updated = translateString(val, isEn);
      if (updated !== val) {
        node.nodeValue = updated;
      }
    }

    // Translate input & textarea placeholders
    const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input[placeholder], textarea[placeholder]"
    );
    inputs.forEach((el) => {
      const ph = el.getAttribute("placeholder");
      if (!ph) return;
      const updated = translateString(ph, isEn);
      if (updated !== ph) {
        el.setAttribute("placeholder", updated);
      }
    });

    // Translate title tooltips
    const titled = document.querySelectorAll<HTMLElement>("[title]");
    titled.forEach((el) => {
      if (el.closest(".infatrack-lang-toggle")) return;
      const t = el.getAttribute("title");
      if (!t) return;
      const updated = translateString(t, isEn);
      if (updated !== t) {
        el.setAttribute("title", updated);
      }
    });

    // Translate accessibility aria-labels
    const labeled = document.querySelectorAll<HTMLElement>("[aria-label]");
    labeled.forEach((el) => {
      if (el.closest(".infatrack-lang-toggle")) return;
      const a = el.getAttribute("aria-label");
      if (!a) return;
      const updated = translateString(a, isEn);
      if (updated !== a) {
        el.setAttribute("aria-label", updated);
      }
    });
  } catch (err) {
    console.warn("[i18n DOM Translation Warning]", err);
  } finally {
    isTranslating = false;
    if (domObserver && document.body) {
      domObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  }
}

export function initI18nAutoTranslator() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const current = resolveLanguage();
  runDomTranslation(current);

  if (!domObserver && document.body) {
    domObserver = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        runDomTranslation(resolveLanguage());
      }, 50);
    });
    domObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
}

export function applyLanguage(lang: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("data-lang", lang);
    runDomTranslation(lang);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("infatrack-language", { detail: lang }));
  }
}

export function toggleLanguage(): Language {
  const current = resolveLanguage();
  const next: Language = current === "tl" ? "en" : "tl";
  applyLanguage(next);
  return next;
}

export function subscribeLanguage(callback: (lang: Language) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<Language>).detail;
    callback(detail ?? resolveLanguage());
  };
  const storageHandler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && (e.newValue === "tl" || e.newValue === "en")) {
      callback(e.newValue);
    }
  };
  window.addEventListener("infatrack-language", handler);
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener("infatrack-language", handler);
    window.removeEventListener("storage", storageHandler);
  };
}

export function useTranslation() {
  const [language, setLanguageState] = useState<Language>(() => resolveLanguage());

  useEffect(() => {
    return subscribeLanguage((newLang) => setLanguageState(newLang));
  }, []);

  return {
    language,
    isEn: language === "en",
    setLanguage: (lang: Language) => applyLanguage(lang),
    toggleLanguage: () => toggleLanguage(),
    t: (key: string, fallback?: string) => translate(key, language, fallback),
  };
}

/* ── Translation Dictionaries ──────────────────────────────────────────────── */
export const translations: Record<Language, Record<string, string>> = {
  tl: {
    // Common / Global
    "common.save": "I-save",
    "common.cancel": "Kanselahin",
    "common.close": "Isara",
    "common.search": "Maghanap...",
    "common.filter": "Salain",
    "common.all": "Lahat",
    "common.loading": "Ikinakarga...",
    "common.logout": "Lumabas",
    "common.back": "Bumalik",
    "common.submit": "Isumite",
    "common.actions": "Mga Aksyon",
    "common.status": "Katayuan",
    "common.date": "Petsa",
    "common.applicant": "Aplikante",
    "common.barangay": "Barangay",
    "common.preview": "Suriin",
    "common.download": "I-download",
    "common.details": "Mga Detalye",
    "common.live_sync": "Real-time Live Sync",
    "common.language": "Wika",
    "common.switch_lang": "Switch to English",

    // Navigation & Sidebar
    "nav.menu": "Pangunahing Menu",
    "nav.engineering_office": "TANGGAPAN NG INHINYERO",
    "nav.command_center": "Command Center",
    "nav.site_inspections": "Site Inspections",
    "nav.projects": "Proyekto ng Bayan",
    "nav.schedules": "Iskedyul ng Ocular",
    "nav.personnel": "Kawani at Inhinyero",
    "nav.documents": "Dokumento & Blueprints",
    "nav.map_3d": "3D GIS Mapa",
    "nav.open_3d_map": "Buksan ang 3D Mapa",
    "nav.quick_links": "Mabilis na Ugnayan",
    "nav.modules": "Mga Modyul ng Inhinyero",
    "nav.collapse_sidebar": "I-collapse ang side navbar",
    "nav.expand_sidebar": "I-expand ang side navbar",
    "nav.permits": "Mga Aplikasyon",
    "nav.permits_registry": "Talaan ng Permits",
    "nav.permits_tooltip": "Suriin at Aprubahan ang mga Aplikasyon ng Mamamayan (Zoning Clearances & Documentary Review)",
    "nav.permits_reg_tooltip": "Talaan ng mga Natanggap na Aplikasyon (Zoning Permits)",
    "nav.planning": "Pagpaplano ng Bayan",
    "nav.planning_tooltip": "Mga Panukala at Pagpupulong ng MPDC (Board, Calendar, Meetings)",
    "nav.mpdc_documents": "Mga Dokumento",
    "nav.mpdc_docs_tooltip": "Repositoryo ng mga Naaprubahang Dokumento",
    "nav.analytics": "Analitika at GIS",
    "nav.analytics_tooltip": "Executive Infrastructure GIS Telemetry & Analytics",
    "nav.audit": "Talaan ng Aktibidad",
    "nav.audit_tooltip": "24-Oras na Real-Time Audit Trail at Talaan ng mga Aksyon",
    "nav.admin_panel": "Pangasiwaan ng Sistema",
    "nav.admin_panel_tooltip": "Pangasiwaan ng Sistema (User Accounts, Config, Backups)",
    "nav.mpdc_admin": "MPDC Admin",
    "nav.mpdc_admin_tooltip": "Pangasiwaan ng MPDC (Executive Planning Dashboard)",
    "nav.engineering_office_title": "Tanggapan ng Inhinyero",

    // Engineer Dashboard
    "eng.republic": "Republika ng Pilipinas · Lalawigan ng Laguna",
    "eng.dept_name": "Pangasiwaan ng Inhinyero (Executive Dashboard)",
    "eng.hero_title": "Tanggapan ng Inhinyero at Pangangasiwa ng Gusali",
    "eng.hero_tag": "● Executive Command Center · Tanggapan ng Inhinyero",
    "eng.hero_desc": "Sentralisadong dashboard para sa pagsusuri ng mga natanggap na Opisyal na Resibo mula sa Assessor, pag-iiskedyul ng ocular inspection, at pre-construction coordinate pinning sa 3D Mapa ng Bayan ng Luisiana.",
    "eng.btn_inspect_queue": "Suriin ang Inspection Queue →",
    "eng.btn_pin_map": "I-pin sa 3D Mapa",
    "eng.kpi_pending": "NAGHIHINTAY NG SITE INSPECTION",
    "eng.kpi_pending_sub": "Nai-upload ang resibo mula sa Assessor; handa para sa ocular visit",
    "eng.kpi_approved": "NAKA-PIN SA 3D MAPA / APRUBADO",
    "eng.kpi_approved_sub": "Na-inspeksyon at nabigyan ng clearance para sa konstruksyon",
    "eng.kpi_receipts": "RESIBO MULA SA ASSESSOR",
    "eng.kpi_receipts_sub": "Kabuuang naitalang opisyal na patunay ng kabayaran",
    "eng.kpi_infra": "AKTIBONG PROYEKTO NG BAYAN",
    "eng.kpi_infra_sub": "Kasalukuyang ginagawang tulay, kalsada, at pasilidad",
    "eng.urgent_title": "Mga Unang Nangangailangan ng Inspeksyon",
    "eng.urgent_sub": "Nai-upload ang resibo at naghihintay ng pagbisita",
    "eng.view_all": "Tingnan Lahat",
    "eng.geotech_title": "Geotechnical & Siting Overview",
    "eng.geotech_sub": "Bayan ng Luisiana Geohazard Monitoring (PHIVOLCS & MGB)",
    "eng.open_in_map": "Bukas sa Mapa ↗",
    "eng.clup_compliance": "Zoning & CLUP Compliance",
    "eng.clup_pill": "98% Pagsunod",
    "eng.clup_desc": "Nakasunod sa tamang zoning classification ang mga isinusumiteng aplikasyon batay sa MPDC CLUP 2024–2034.",
    "eng.landslide_title": "Rain-Induced Landslide Siting",
    "eng.landslide_pill": "Mataas na Pag-iingat",
    "eng.landslide_desc": "Ang mga barangay sa bulubunduking bahagi (San Isidro, San Salvador, De La Paz) ay nangangailangan ng slope protection plan bago mag-clearance.",
    "eng.pinning_title": "Coordinate Pinning Engine",
    "eng.pinning_desc": "Lahat ng naaprubahang aplikasyon ay awtomatikong inilalagay bilang 3D pin sa satellite globe upang maiwasan ang double-titling at boundary disputes.",
    "eng.pinned_tag": "✓ Naka-pin",
    "eng.pending_tag": "Naghihintay",
    "eng.hold_tag": "Naka-hold",
    "eng.review_btn": "Suriin",
    "eng.approve_modal_title": "Aprubahan at I-pin sa 3D Mapa",
    "eng.approve_confirm_btn": "Oo, Aprubahan at I-pin sa 3D Mapa",
    "eng.hold_modal_title": "I-hold at Ibalik ang Aplikasyon",
    "eng.hold_confirm_btn": "Kumpirmahin ang Pag-Hold",
    "eng.schedule_modal_title": "Magtakda ng Ocular Site Inspection",
    "eng.schedule_modal_sub": "Field Visit para sa Pagsusuri ng Lupa at Resibo",
    "eng.schedule_submit_btn": "Itakda ang Iskedyul",

    // Inspections Queue tab
    "eng.search_placeholder": "Hanapin ayon sa Tracking Reference, Pangalan, O.R. Blg., o Barangay...",
    "eng.filter_all": "Lahat",
    "eng.filter_pending": "Naghihintay",
    "eng.filter_hold": "Naka-Hold",
    "eng.filter_pinned": "Naka-pin",
    "eng.all_barangays": "Lahat ng Barangay",
    "eng.submitted_on": "Isinumite:",
    "eng.status_pinned_3d": "✓ Naka-pin sa 3D Mapa",
    "eng.status_hold_badge": "⚠ Naka-Hold / Ibinalik",
    "eng.status_pending_badge": "● Naghihintay ng Clearance",
    "eng.applicant_loc": "Aplikante & Lokasyon",
    "eng.proposed_bldg": "Ipinapanukalang Gusali",
    "eng.est_cost": "Halaga:",
    "eng.hold_reason_title": "Dahilan ng Pagka-Hold:",
    "eng.or_header": "OFFICIAL RECEIPT (MULA SA ASSESSOR):",
    "eng.date_label": "Petsa:",
    "eng.or_status_text": "Nai-record mula sa Assessor",
    "eng.view_receipt_btn": "Tingnan ang Resibo",
    "eng.attached_docs_label": "Kasamang Dokumento:",
    "eng.view_map_btn": "Tingnan sa Mapa",
    "eng.schedule_inspection_btn": "Itakda ang Inspeksyon",
    "eng.approve_pin_btn": "Aprubahan at I-pin sa 3D Mapa",
    "eng.hold_return_btn": "I-Hold / Ibalik",
    "eng.no_apps_found": "Walang Natagpuang Aplikasyon",
    "eng.no_apps_filter": "Walang tumutugma sa kasalukuyang filter o search term.",
    "eng.no_apps_empty": "Wala pang aplikasyon na nakapag-upload ng resibo mula sa Assessor sa ngayon.",
    "eng.loading_records": "Kinukuha ang mga talaan ng aplikasyon at resibo mula sa database...",
    "eng.retry_btn": "Subukang Muli",

    // Projects & Schedules & Personnel
    "eng.projects_title": "Mga Proyekto ng Bayan ng Luisiana",
    "eng.projects_sub": "Kasalukuyang konstruksyon ng tulay, kalsada, at pasilidad pambayan",
    "eng.schedules_title": "Iskedyul ng Ocular Site Inspection",
    "eng.schedules_sub": "Pagsusuri sa aktwal na lupain, boundary setbacks, at mohon",
    "eng.personnel_title": "Roster ng Kawani at Inhinyero",
    "eng.personnel_sub": "Mga lisensyadong civil engineer, architect, at geodetic specialist",
    "eng.add_schedule_btn": "+ Magtakda ng Bagong Inspeksyon",

    // Documents Vault
    "docs.title": "Mga Dokumento ng Inhinyero (Engineering Documents & Blueprints Vault)",
    "docs.kpi_total": "Kabuuang Dossiers",
    "docs.kpi_total_sub": "Aplikasyong may rekord",
    "docs.kpi_receipts": "Opisyal na Resibo (O.R.)",
    "docs.kpi_receipts_sub": "Katibayan ng bayad",
    "docs.kpi_blueprints": "Blueprints & CAD",
    "docs.kpi_blueprints_sub": "Teknikal na plano",
    "docs.kpi_clearances": "Mga Clearance",
    "docs.kpi_clearances_sub": "Barangay & Zoning",
    "docs.cat_all": "Lahat ng Dokumento",
    "docs.cat_receipts": "Opisyal na Resibo O.R.",
    "docs.cat_blueprints": "Blueprints & CAD",
    "docs.cat_clearance": "Barangay Clearance",
    "docs.cat_zoning": "Zoning Clearance",
    "docs.col_dossier": "Aplikante & Dossier",
    "docs.col_category": "Kategorya & Lokasyon",
    "docs.col_receipt": "Opisyal na Resibo (Assessor)",
    "docs.col_status": "Status ng Engineering",
    "docs.col_files": "Mga Dokumento & Aksyon",
    "docs.check_receipt": "Suriin ang Resibo",
    "docs.no_receipt": "Walang Na-upload na Resibo",
    "docs.view_file": "Tingnan ang File",
    "docs.expand_details": "I-expand ang Detalye",
    "docs.collapse_details": "Itago ang Detalye",
    "docs.verified": "BERIPIKADO",
    "docs.search_placeholder": "Maghanap sa Tracking ID, Pangalan, O.R. #, o Barangay...",

    // Landing
    "landing.badge": "Live · Bayan ng Luisiana, Laguna",
    "landing.hero_sub": "Tumpak na GIS & Ligtas sa Sakunang Pagpaplano",
    "landing.hero_lede": "Pagbibigay kapangyarihan sa mga inhinyero, tagaplano, at mamamayan ng Luisiana upang makapagtayo sa mas ligtas na lupain — gamit ang 3D terrain intelligence, pagsusuri sa panganib, at mabilis na ugnayan ng mga departamento.",
    "landing.start_application": "Magsimula ng Bagong Aplikasyon",
    "landing.public_portal": "Buksan ang Pampublikong Portal",
    "landing.track_permit": "Subaybayan ang Permit",
    "landing.dept_sign_in": "Department Sign In →",
    "landing.nav_overview": "Pangkalahatan",
    "landing.nav_features": "Mga Tampok & Arkitektura",
    "landing.nav_departments": "Mga Kagawaran",
    "landing.nav_risk": "Panganib sa Sakuna",
    "landing.nav_about": "Tungkol sa Luisiana",
    "landing.sign_in": "Sign In",
    "landing.new_app": "Bagong Aplikasyon",
    "landing.track_permit_status": "Subaybayan ang Katayuan ng Permit",
  },
  en: {
    // Common / Global
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.close": "Close",
    "common.search": "Search...",
    "common.filter": "Filter",
    "common.all": "All",
    "common.loading": "Loading...",
    "common.logout": "Sign Out",
    "common.back": "Go Back",
    "common.submit": "Submit",
    "common.actions": "Actions",
    "common.status": "Status",
    "common.date": "Date",
    "common.applicant": "Applicant",
    "common.barangay": "Barangay",
    "common.preview": "Preview",
    "common.download": "Download",
    "common.details": "Details",
    "common.live_sync": "Real-time Live Sync",
    "common.language": "Language",
    "common.switch_lang": "Lumipat sa Tagalog",

    // Navigation & Sidebar
    "nav.menu": "Main Menu",
    "nav.engineering_office": "MUNICIPAL ENGINEERING OFFICE",
    "nav.command_center": "Command Center",
    "nav.site_inspections": "Site Inspections",
    "nav.projects": "Municipal Projects",
    "nav.schedules": "Ocular Schedules",
    "nav.personnel": "Staff & Engineers",
    "nav.documents": "Documents & Blueprints",
    "nav.map_3d": "3D GIS Map",
    "nav.open_3d_map": "Open 3D Map",
    "nav.quick_links": "Quick Links",
    "nav.modules": "Engineering Modules",
    "nav.collapse_sidebar": "Collapse side navbar",
    "nav.expand_sidebar": "Expand side navbar",
    "nav.permits": "Permit Applications",
    "nav.permits_registry": "Permits Registry",
    "nav.permits_tooltip": "Review & approve citizen applications (Zoning Clearances & Documentary Review)",
    "nav.permits_reg_tooltip": "Registry of received applications (Zoning Permits)",
    "nav.planning": "Municipal Planning",
    "nav.planning_tooltip": "Municipal Planning & Development Proposals (Board, Calendar, Meetings)",
    "nav.mpdc_documents": "Documents Repository",
    "nav.mpdc_docs_tooltip": "Approved Documents Repository",
    "nav.analytics": "Analytics & GIS",
    "nav.analytics_tooltip": "Executive Infrastructure GIS Telemetry & Analytics",
    "nav.audit": "Activity Log",
    "nav.audit_tooltip": "24-Hour Real-Time Audit Trail & Operations Log",
    "nav.admin_panel": "Admin Panel",
    "nav.admin_panel_tooltip": "System Administration (User Accounts, Config, Backups)",
    "nav.mpdc_admin": "MPDC Admin",
    "nav.mpdc_admin_tooltip": "MPDC Executive Planning & Administration Dashboard",
    "nav.engineering_office_title": "Office of the Engineer",

    // Engineer Dashboard
    "eng.republic": "Republic of the Philippines · Province of Laguna",
    "eng.dept_name": "Municipal Engineering Office (Executive Dashboard)",
    "eng.hero_title": "Office of the Municipal Engineer & Building Official",
    "eng.hero_tag": "● Executive Command Center · Engineering Office",
    "eng.hero_desc": "Centralized dashboard for reviewing Official Receipts received from the Assessor, scheduling ocular inspections, and pre-construction coordinate pinning on the 3D Map of the Municipality of Luisiana.",
    "eng.btn_inspect_queue": "Review Inspection Queue →",
    "eng.btn_pin_map": "Pin to 3D Map",
    "eng.kpi_pending": "AWAITING SITE INSPECTION",
    "eng.kpi_pending_sub": "Receipt uploaded from Assessor; ready for ocular inspection",
    "eng.kpi_approved": "PINNED ON 3D MAP / APPROVED",
    "eng.kpi_approved_sub": "Inspected and granted clearance for site construction",
    "eng.kpi_receipts": "RECEIPTS FROM ASSESSOR",
    "eng.kpi_receipts_sub": "Total official proof of payment records registered",
    "eng.kpi_infra": "ACTIVE MUNICIPAL INFRA PROJECTS",
    "eng.kpi_infra_sub": "Currently ongoing bridges, roads, and municipal facilities",
    "eng.urgent_title": "Priority Inspection Queue",
    "eng.urgent_sub": "Receipt uploaded and awaiting ocular site visit",
    "eng.view_all": "View All",
    "eng.geotech_title": "Geotechnical & Siting Overview",
    "eng.geotech_sub": "Municipality of Luisiana Geohazard Monitoring (PHIVOLCS & MGB)",
    "eng.open_in_map": "Open in Map ↗",
    "eng.clup_compliance": "Zoning & CLUP Compliance",
    "eng.clup_pill": "98% Compliant",
    "eng.clup_desc": "Submitted applications strictly comply with municipal zoning classifications under the MPDC CLUP 2024–2034.",
    "eng.landslide_title": "Rain-Induced Landslide Siting",
    "eng.landslide_pill": "High Caution",
    "eng.landslide_desc": "Upland barangays (San Isidro, San Salvador, De La Paz) require a certified slope protection plan prior to clearance.",
    "eng.pinning_title": "Coordinate Pinning Engine",
    "eng.pinning_desc": "All approved applications are automatically pinned on the 3D satellite globe to prevent double-titling and boundary disputes.",
    "eng.pinned_tag": "✓ Pinned",
    "eng.pending_tag": "Pending",
    "eng.hold_tag": "On Hold",
    "eng.review_btn": "Review",
    "eng.approve_modal_title": "Approve & Pin to 3D Map",
    "eng.approve_confirm_btn": "Yes, Approve & Pin to 3D Map",
    "eng.hold_modal_title": "Hold & Return Application",
    "eng.hold_confirm_btn": "Confirm Hold",
    "eng.schedule_modal_title": "Schedule Ocular Site Inspection",
    "eng.schedule_modal_sub": "Field visit for land boundary and receipt verification",
    "eng.schedule_submit_btn": "Schedule Inspection",

    // Inspections Queue tab
    "eng.search_placeholder": "Search by Tracking Reference, Name, O.R. No., or Barangay...",
    "eng.filter_all": "All",
    "eng.filter_pending": "Pending",
    "eng.filter_hold": "On Hold",
    "eng.filter_pinned": "Pinned",
    "eng.all_barangays": "All Barangays",
    "eng.submitted_on": "Submitted:",
    "eng.status_pinned_3d": "✓ Pinned on 3D Map",
    "eng.status_hold_badge": "⚠ On Hold / Returned",
    "eng.status_pending_badge": "● Awaiting Clearance",
    "eng.applicant_loc": "Applicant & Location",
    "eng.proposed_bldg": "Proposed Building",
    "eng.est_cost": "Estimated Cost:",
    "eng.hold_reason_title": "Hold Reason:",
    "eng.or_header": "OFFICIAL RECEIPT (FROM ASSESSOR):",
    "eng.date_label": "Date:",
    "eng.or_status_text": "Recorded from Assessor",
    "eng.view_receipt_btn": "View Receipt",
    "eng.attached_docs_label": "Attached Documents:",
    "eng.view_map_btn": "View in Map",
    "eng.schedule_inspection_btn": "Schedule Inspection",
    "eng.approve_pin_btn": "Approve & Pin to 3D Map",
    "eng.hold_return_btn": "Hold / Return",
    "eng.no_apps_found": "No Applications Found",
    "eng.no_apps_filter": "No applications match your current filter or search criteria.",
    "eng.no_apps_empty": "No applications have uploaded receipts from the Assessor yet.",
    "eng.loading_records": "Fetching applications and receipts from database...",
    "eng.retry_btn": "Retry",

    // Projects & Schedules & Personnel
    "eng.projects_title": "Municipality of Luisiana Infrastructure Projects",
    "eng.projects_sub": "Ongoing bridge, road, and municipal facility construction",
    "eng.schedules_title": "Ocular Site Inspection Schedules",
    "eng.schedules_sub": "Field verification for land boundaries, setbacks, and monuments",
    "eng.personnel_title": "Engineering Staff & Personnel Roster",
    "eng.personnel_sub": "Licensed civil engineers, architects, and geodetic survey specialists",
    "eng.add_schedule_btn": "+ Schedule New Inspection",

    // Documents Vault
    "docs.title": "Engineering Documents & Blueprints Vault",
    "docs.kpi_total": "Total Dossiers",
    "docs.kpi_total_sub": "Applications on record",
    "docs.kpi_receipts": "Official Receipts (O.R.)",
    "docs.kpi_receipts_sub": "Proof of payment",
    "docs.kpi_blueprints": "Blueprints & CAD",
    "docs.kpi_blueprints_sub": "Technical plans",
    "docs.kpi_clearances": "Clearances",
    "docs.kpi_clearances_sub": "Barangay & Zoning",
    "docs.cat_all": "All Documents",
    "docs.cat_receipts": "Official Receipts O.R.",
    "docs.cat_blueprints": "Blueprints & CAD",
    "docs.cat_clearance": "Barangay Clearance",
    "docs.cat_zoning": "Zoning Clearance",
    "docs.col_dossier": "Applicant & Dossier",
    "docs.col_category": "Category & Location",
    "docs.col_receipt": "Official Receipt (Assessor)",
    "docs.col_status": "Engineering Status",
    "docs.col_files": "Documents & Actions",
    "docs.check_receipt": "Verify Receipt",
    "docs.no_receipt": "No Receipt Uploaded",
    "docs.view_file": "View File",
    "docs.expand_details": "Expand Details",
    "docs.collapse_details": "Collapse Details",
    "docs.verified": "VERIFIED",
    "docs.search_placeholder": "Search by Tracking ID, Name, O.R. #, or Barangay...",

    // Landing
    "landing.badge": "Live · Municipality of Luisiana, Laguna",
    "landing.hero_sub": "Precision GIS & Disaster-Resilient Siting",
    "landing.hero_lede": "Empowering Luisiana's municipal engineers, planners, and citizens to build on safer ground — featuring real-time 3D terrain intelligence, hazard risk analytics, and inter-departmental workflows.",
    "landing.start_application": "Start New Application",
    "landing.public_portal": "Open Public Portal",
    "landing.track_permit": "Track Permit",
    "landing.dept_sign_in": "Department Sign In →",
    "landing.nav_overview": "Overview",
    "landing.nav_features": "Features & Architecture",
    "landing.nav_departments": "Departments",
    "landing.nav_risk": "Geohazard Risk",
    "landing.nav_about": "About Luisiana",
    "landing.sign_in": "Sign In",
    "landing.new_app": "New Application",
    "landing.track_permit_status": "Track Permit Status",
  },
};

export function translate(key: string, lang?: Language, fallback?: string): string {
  const activeLang = lang || resolveLanguage();
  const dict = translations[activeLang];
  if (dict && dict[key]) {
    return dict[key];
  }
  // Fallback to Tagalog dictionary if English translation missing
  if (translations.tl && translations.tl[key]) {
    return translations.tl[key];
  }
  return fallback || key;
}

export const t = translate;

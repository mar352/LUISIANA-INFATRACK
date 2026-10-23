import React, { useState, useRef } from "react";
import {
  Building2,
  Sprout,
  Landmark,
  User,
  Phone,
  Mail,
  MapPin,
  Maximize2,
  FileText,
  Receipt,
  FileSpreadsheet,
  ShieldCheck,
  Zap,
  Camera,
  UploadCloud,
  CheckCircle2,
  Trash2,
  Leaf,
  Users,
  Handshake,
  AlertTriangle,
  X,
  ArrowRight,
  Sparkles,
  Info,
  Check,
} from "lucide-react";
import { BARANGAY_LIST } from "../types";

export type ProjectCategory = "private" | "agricultural" | "municipal";

export interface FormValues {
  applicantName: string;
  contactNumber: string;
  email: string;
  barangay: string;
  lotArea: string;
  tctNumber: string;
  taxDeclarationNumber: string;
}

export interface UploadedDoc {
  file: File;
  name: string;
  size: number;
}

interface InfaTrackApplicationFormProps {
  onProceedToGis?: (formData: {
    category: ProjectCategory;
    values: FormValues;
    documents: Record<string, UploadedDoc>;
  }) => void;
  onBack?: () => void;
}

export default function InfaTrackApplicationForm({
  onProceedToGis,
  onBack,
}: InfaTrackApplicationFormProps) {
  // 1. State for Project Categorization
  const [category, setCategory] = useState<ProjectCategory>("agricultural");

  // 2. State for Basic Information
  const [formValues, setFormValues] = useState<FormValues>({
    applicantName: "",
    contactNumber: "",
    email: "",
    barangay: "",
    lotArea: "",
    tctNumber: "",
    taxDeclarationNumber: "",
  });

  // Track field focus for micro-interactions
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // 3. State for Uploaded Documents
  const [documents, setDocuments] = useState<Record<string, UploadedDoc>>({});

  // Hidden file input refs
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleInputChange = (field: keyof FormValues, value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = (docKey: string, file: File | null) => {
    if (!file) return;
    setDocuments((prev) => ({
      ...prev,
      [docKey]: {
        file,
        name: file.name,
        size: file.size,
      },
    }));
  };

  const handleRemoveDoc = (docKey: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDocuments((prev) => {
      const next = { ...prev };
      delete next[docKey];
      return next;
    });
    if (fileInputRefs.current[docKey]) {
      fileInputRefs.current[docKey]!.value = "";
    }
  };

  const triggerUpload = (docKey: string) => {
    fileInputRefs.current[docKey]?.click();
  };

  // Mandatory 6 Citizen's Charter Documents definition
  const mandatoryDocs = [
    {
      key: "tct",
      title: "Photocopy ng TCT (Land Title)",
      desc: "Katibayan ng pagmamay-ari ng lupa mula sa Registry of Deeds.",
      icon: FileText,
      badge: "Citizen's Charter #1",
    },
    {
      key: "tax_dec",
      title: "Tax Declaration",
      desc: "Pinakabagong deklarasyon ng ari-arian mula sa Assessor's Office.",
      icon: FileSpreadsheet,
      badge: "Citizen's Charter #2",
    },
    {
      key: "amilyar",
      title: "Current Real Property Tax Receipt (Amilyar)",
      desc: "Opisyal na resibo ng buwis sa lupa para sa kasalukuyang taon.",
      icon: Receipt,
      badge: "Citizen's Charter #3",
    },
    {
      key: "brgy_clearance",
      title: "Barangay Clearance",
      desc: "Katibayan ng pagsang-ayon mula sa kinasasakupang barangay.",
      icon: ShieldCheck,
      badge: "Citizen's Charter #4",
    },
    {
      key: "plo_meralco",
      title: "PLO Certification (MERALCO)",
      desc: "Sertipikasyon para sa linya ng kuryente at utility connection.",
      icon: Zap,
      badge: "Citizen's Charter #5",
    },
    {
      key: "photo_docs",
      title: "Photo Documentation (Loob at labas ng site)",
      desc: "Malinaw na mga litrato ng kasalukuyang itsura ng lugar at karatig.",
      icon: Camera,
      badge: "Citizen's Charter #6",
    },
  ];

  // Conditional Agricultural Documents
  const agriculturalDocs = [
    {
      key: "ecc_denr",
      title: "Environmental Compliance Certificate (ECC)",
      desc: "Mula sa DENR-EMB para sa environmentally critical projects.",
      icon: Leaf,
      badge: "DENR EMB Required",
    },
    {
      key: "brgy_resolution",
      title: "Barangay Resolution / Minutes of Public Hearing",
      desc: "Katitikan ng konsultasyong pampubliko at resolusyon ng Sangguniang Barangay.",
      icon: Users,
      badge: "Public Consultation",
    },
    {
      key: "neighbor_consent",
      title: "Neighbor's Consent",
      desc: "Katibayan ng walang pagtutol mula sa mga katabing lote (Adjoining Lot Owners).",
      icon: Handshake,
      badge: "Zoning Clearance",
    },
  ];

  // Calculate Missing Items for the Validation Alert Box
  const missingItems: string[] = [];
  if (!formValues.applicantName.trim()) missingItems.push("Pangalan ng Aplikante");
  if (!formValues.contactNumber.trim()) missingItems.push("Contact Number");
  if (!formValues.barangay) missingItems.push("Barangay Location");
  if (!formValues.lotArea.trim()) missingItems.push("Sukat ng Lote");
  if (!formValues.tctNumber.trim()) missingItems.push("TCT No.");
  if (!formValues.taxDeclarationNumber.trim()) missingItems.push("Tax Declaration No.");

  // Mandatory docs missing
  if (!documents["tct"]) missingItems.push("TCT (Land Title)");
  if (!documents["tax_dec"]) missingItems.push("Tax Declaration Doc");
  if (!documents["amilyar"]) missingItems.push("Amilyar Receipt");
  if (!documents["brgy_clearance"]) missingItems.push("Barangay Clearance");
  if (!documents["plo_meralco"]) missingItems.push("PLO Certification");
  if (!documents["photo_docs"]) missingItems.push("Photo Documentation");

  // Conditional Agri docs missing
  if (category === "agricultural") {
    if (!documents["ecc_denr"]) missingItems.push("ECC (DENR)");
    if (!documents["brgy_resolution"]) missingItems.push("Barangay Resolution / Minutes");
    if (!documents["neighbor_consent"]) missingItems.push("Neighbor's Consent");
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onProceedToGis) {
      onProceedToGis({
        category,
        values: formValues,
        documents,
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#080E1A] text-slate-100 font-sans antialiased selection:bg-blue-500/30 selection:text-blue-200">
      {/* Background Ambient Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-40 left-1/4 w-[650px] h-[650px] bg-blue-600/10 rounded-full blur-[140px]" />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] bg-emerald-600/10 rounded-full blur-[130px]" />
        <div className="absolute bottom-10 left-1/3 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[150px]" />
      </div>

      {/* Main Container */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {/* Top Header Badge & Title */}
        <header className="mb-10 text-center sm:text-left border-b border-slate-800/80 pb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/80 text-xs font-medium text-slate-300 shadow-sm backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-blue-400 tracking-wide uppercase">INFA-TRACK</span>
              <span className="text-slate-600">•</span>
              <span>LGU Enterprise Siting & Permitting Portal</span>
            </div>

            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white transition-all duration-200"
              >
                <span>←</span>
                <span>Bumalik sa Dashboard</span>
              </button>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white mb-3">
            Formulario ng Bagong Aplikasyon
          </h1>
          <p className="text-sm sm:text-base text-slate-400 max-w-3xl leading-relaxed">
            Pakikumpleto ang pagkakakilanlan ng proyekto, batayang impormasyon ng aplikante, at mga itinakdang dokumento alinsunod sa Citizen&apos;s Charter ng Bayan ng Luisiana bago magpatuloy sa GIS Siting.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-12">
          {/* ========================================================================= */}
          {/* 1. PROJECT CATEGORIZATION (Radio Cards)                                  */}
          {/* ========================================================================= */}
          <section aria-labelledby="section-category" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="section-category" className="text-lg sm:text-xl font-semibold text-white tracking-tight flex items-center gap-2.5">
                  <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-bold">
                    1
                  </span>
                  <span>Ano ang ia-apply?</span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-1 ml-9">
                  Piliin ang naaangkop na kategorya ng iyong imprastraktura o pasilidad.
                </p>
              </div>

              <div className="text-xs text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-full border border-slate-800">
                Kasalukuyang pinili:{" "}
                <span className="font-semibold text-blue-400 capitalize">
                  {category === "agricultural" ? "Agricultural Zone" : "Private Infrastructure"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Card A: Private Infrastructure */}
              <div
                role="radio"
                aria-checked={category === "private"}
                tabIndex={0}
                onClick={() => setCategory("private")}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setCategory("private")}
                className={`relative group cursor-pointer rounded-2xl p-6 transition-all duration-300 border text-left outline-none ${
                  category === "private"
                    ? "bg-slate-900/90 border-blue-500/80 shadow-[0_0_30px_-5px_rgba(59,130,246,0.3)] ring-1 ring-blue-500/40"
                    : "bg-[#0F172A]/70 hover:bg-[#131E33] border-slate-800/80 hover:border-slate-700/80"
                }`}
              >
                {/* Radio check badge */}
                <div className="absolute top-5 right-5">
                  <div
                    className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all duration-200 ${
                      category === "private"
                        ? "bg-blue-600 border-blue-500 text-white shadow-sm scale-100"
                        : "border-slate-700 bg-slate-800/80 text-transparent group-hover:border-slate-600"
                    }`}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  </div>
                </div>

                <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-4 transition-transform duration-200 group-hover:scale-105">
                  <Building2 className="w-6 h-6" />
                </div>

                <div className="space-y-1">
                  <h3 className="font-semibold text-base text-white group-hover:text-blue-300 transition-colors">
                    Private Infrastructure
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    Residential / Commercial
                  </p>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                  <span>Regular Processing</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800/90 text-slate-300">
                    Standard
                  </span>
                </div>
              </div>

              {/* Card B: Agricultural Zone (Active Showcase) */}
              <div
                role="radio"
                aria-checked={category === "agricultural"}
                tabIndex={0}
                onClick={() => setCategory("agricultural")}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setCategory("agricultural")}
                className={`relative group cursor-pointer rounded-2xl p-6 transition-all duration-300 border text-left outline-none ${
                  category === "agricultural"
                    ? "bg-slate-900/90 border-emerald-500/80 shadow-[0_0_30px_-5px_rgba(16,185,129,0.3)] ring-1 ring-emerald-500/40"
                    : "bg-[#0F172A]/70 hover:bg-[#131E33] border-slate-800/80 hover:border-slate-700/80"
                }`}
              >
                {/* Radio check badge */}
                <div className="absolute top-5 right-5">
                  <div
                    className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all duration-200 ${
                      category === "agricultural"
                        ? "bg-emerald-600 border-emerald-500 text-white shadow-sm scale-100"
                        : "border-slate-700 bg-slate-800/80 text-transparent group-hover:border-slate-600"
                    }`}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  </div>
                </div>

                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4 transition-transform duration-200 group-hover:scale-105">
                  <Sprout className="w-6 h-6" />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base text-white group-hover:text-emerald-300 transition-colors">
                      Agricultural Zone
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 font-medium">
                    Poultry / Piggery / Farm Structures
                  </p>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs">
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Special Requirements
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold">
                    DENR / LGU
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ========================================================================= */}
          {/* 2. BASIC INFORMATION (Form Grid)                                         */}
          {/* ========================================================================= */}
          <section aria-labelledby="section-basic-info" className="space-y-4">
            <div>
              <h2 id="section-basic-info" className="text-lg sm:text-xl font-semibold text-white tracking-tight flex items-center gap-2.5">
                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-bold">
                  2
                </span>
                <span>Pangunahing Impormasyon (Basic Information)</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 ml-9">
                Isumite ang opisyal na pagkakakilanlan ng aplikante at talaan ng lote sa Bayan ng Luisiana.
              </p>
            </div>

            <div className="p-6 sm:p-8 rounded-2xl bg-[#0F172A]/80 border border-slate-800/90 shadow-xl backdrop-blur-sm space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
                {/* 1. Pangalan ng Aplikante / May-ari */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-blue-400" />
                    <span>Pangalan ng Aplikante / May-ari</span>
                    <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Hal. Juan Dela Cruz o Dela Cruz Agri-Farm Corp."
                      value={formValues.applicantName}
                      onChange={(e) => handleInputChange("applicantName", e.target.value)}
                      onFocus={() => setFocusedField("applicantName")}
                      onBlur={() => setFocusedField(null)}
                      className={`w-full px-4 py-3 rounded-xl bg-[#080E1A] text-slate-100 placeholder:text-slate-500 border text-sm transition-all duration-200 outline-none ${
                        focusedField === "applicantName"
                          ? "border-blue-400 ring-2 ring-blue-500/30 shadow-[0_0_15px_-3px_rgba(59,130,246,0.25)]"
                          : "border-slate-700/80 hover:border-slate-600"
                      }`}
                    />
                  </div>
                </div>

                {/* 2. Mobile Contact Number */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-blue-400" />
                    <span>Mobile Contact Number</span>
                    <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="Hal. 0917-123-4567"
                    value={formValues.contactNumber}
                    onChange={(e) => handleInputChange("contactNumber", e.target.value)}
                    onFocus={() => setFocusedField("contactNumber")}
                    onBlur={() => setFocusedField(null)}
                    className={`w-full px-4 py-3 rounded-xl bg-[#080E1A] text-slate-100 placeholder:text-slate-500 border text-sm transition-all duration-200 outline-none ${
                      focusedField === "contactNumber"
                        ? "border-blue-400 ring-2 ring-blue-500/30 shadow-[0_0_15px_-3px_rgba(59,130,246,0.25)]"
                        : "border-slate-700/80 hover:border-slate-600"
                    }`}
                  />
                </div>

                {/* 3. Email Address */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-blue-400" />
                    <span>Email Address</span>
                  </label>
                  <input
                    type="email"
                    placeholder="Hal. aplikante@email.com"
                    value={formValues.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    onFocus={() => setFocusedField("email")}
                    onBlur={() => setFocusedField(null)}
                    className={`w-full px-4 py-3 rounded-xl bg-[#080E1A] text-slate-100 placeholder:text-slate-500 border text-sm transition-all duration-200 outline-none ${
                      focusedField === "email"
                        ? "border-blue-400 ring-2 ring-blue-500/30 shadow-[0_0_15px_-3px_rgba(59,130,246,0.25)]"
                        : "border-slate-700/80 hover:border-slate-600"
                    }`}
                  />
                </div>

                {/* 4. Barangay Location (Dropdown) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-400" />
                    <span>Barangay Location</span>
                    <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={formValues.barangay}
                      onChange={(e) => handleInputChange("barangay", e.target.value)}
                      onFocus={() => setFocusedField("barangay")}
                      onBlur={() => setFocusedField(null)}
                      className={`w-full px-4 py-3 rounded-xl bg-[#080E1A] text-slate-100 border text-sm transition-all duration-200 outline-none appearance-none cursor-pointer ${
                        focusedField === "barangay"
                          ? "border-blue-400 ring-2 ring-blue-500/30 shadow-[0_0_15px_-3px_rgba(59,130,246,0.25)]"
                          : "border-slate-700/80 hover:border-slate-600"
                      }`}
                    >
                      <option value="" disabled className="bg-slate-900 text-slate-500">
                        -- Pumili ng Barangay sa Luisiana --
                      </option>
                      {BARANGAY_LIST.map((brgy) => (
                        <option key={brgy} value={brgy} className="bg-slate-900 text-slate-200">
                          {brgy}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                        <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* 5. Sukat ng Lote / Lot Area in sq.m. */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Maximize2 className="w-3.5 h-3.5 text-blue-400" />
                    <span>Sukat ng Lote / Lot Area (sq.m.)</span>
                    <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="1"
                      placeholder="Hal. 2500"
                      value={formValues.lotArea}
                      onChange={(e) => handleInputChange("lotArea", e.target.value)}
                      onFocus={() => setFocusedField("lotArea")}
                      onBlur={() => setFocusedField(null)}
                      className={`w-full px-4 py-3 rounded-xl bg-[#080E1A] text-slate-100 placeholder:text-slate-500 border text-sm transition-all duration-200 outline-none ${
                        focusedField === "lotArea"
                          ? "border-blue-400 ring-2 ring-blue-500/30 shadow-[0_0_15px_-3px_rgba(59,130,246,0.25)]"
                          : "border-slate-700/80 hover:border-slate-600"
                      }`}
                    />
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-xs font-semibold text-slate-500">
                      sq.m.
                    </div>
                  </div>
                </div>

                {/* 6. TCT No. / Transfer Certificate of Title */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                    <span>TCT No. / Transfer Certificate of Title</span>
                    <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Hal. T-123456 o OCT-987"
                    value={formValues.tctNumber}
                    onChange={(e) => handleInputChange("tctNumber", e.target.value)}
                    onFocus={() => setFocusedField("tctNumber")}
                    onBlur={() => setFocusedField(null)}
                    className={`w-full px-4 py-3 rounded-xl bg-[#080E1A] text-slate-100 placeholder:text-slate-500 border text-sm transition-all duration-200 outline-none ${
                      focusedField === "tctNumber"
                        ? "border-blue-400 ring-2 ring-blue-500/30 shadow-[0_0_15px_-3px_rgba(59,130,246,0.25)]"
                        : "border-slate-700/80 hover:border-slate-600"
                    }`}
                  />
                </div>

                {/* 7. Tax Declaration (TD) No. */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5 text-blue-400" />
                    <span>Tax Declaration (TD) No.</span>
                    <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Hal. TD-2026-04-00124"
                    value={formValues.taxDeclarationNumber}
                    onChange={(e) => handleInputChange("taxDeclarationNumber", e.target.value)}
                    onFocus={() => setFocusedField("taxDeclarationNumber")}
                    onBlur={() => setFocusedField(null)}
                    className={`w-full px-4 py-3 rounded-xl bg-[#080E1A] text-slate-100 placeholder:text-slate-500 border text-sm transition-all duration-200 outline-none ${
                      focusedField === "taxDeclarationNumber"
                        ? "border-blue-400 ring-2 ring-blue-500/30 shadow-[0_0_15px_-3px_rgba(59,130,246,0.25)]"
                        : "border-slate-700/80 hover:border-slate-600"
                    }`}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ========================================================================= */}
          {/* 3. MANDATORY DOCUMENTS (Upload Grid - Citizen's Charter)                  */}
          {/* ========================================================================= */}
          <section aria-labelledby="section-mandatory-docs" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="section-mandatory-docs" className="text-lg sm:text-xl font-semibold text-white tracking-tight flex items-center gap-2.5">
                  <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-bold">
                    3
                  </span>
                  <span>Anim (6) na Mandatory Documents (Citizen&apos;s Charter)</span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-1 ml-9">
                  Mga pangunahing dokumentong iniuutos ng Munisipyo para sa pagsusuri ng zoning at titulo.
                </p>
              </div>

              <div className="text-xs font-medium px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-400">
                Uploaded:{" "}
                <span className="text-blue-400 font-bold">
                  {mandatoryDocs.filter((d) => !!documents[d.key]).length}
                </span>{" "}
                / 6
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {mandatoryDocs.map((doc) => {
                const IconComponent = doc.icon;
                const uploaded = documents[doc.key];

                return (
                  <div
                    key={doc.key}
                    className={`relative rounded-2xl p-5 border flex flex-col justify-between transition-all duration-200 ${
                      uploaded
                        ? "bg-[#0B1527] border-blue-500/40 shadow-sm"
                        : "bg-[#0F172A]/70 border-slate-800/80 hover:border-slate-700/80"
                    }`}
                  >
                    {/* Hidden input */}
                    <input
                      type="file"
                      ref={(el) => (fileInputRefs.current[doc.key] = el)}
                      onChange={(e) => handleFileUpload(doc.key, e.target.files?.[0] || null)}
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png"
                    />

                    <div>
                      {/* Top icon and badge */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            uploaded
                              ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                              : "bg-slate-800/80 text-slate-300 border border-slate-700/60"
                          }`}
                        >
                          <IconComponent className="w-5 h-5" />
                        </div>

                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            uploaded
                              ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1"
                              : "bg-slate-800 text-slate-400 border border-slate-700/60"
                          }`}
                        >
                          {uploaded ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              Nai-upload
                            </>
                          ) : (
                            "Kailangan"
                          )}
                        </span>
                      </div>

                      {/* Title & Description */}
                      <h3 className="text-sm font-semibold text-white mb-1.5 leading-snug">
                        {doc.title}
                      </h3>
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4">
                        {doc.desc}
                      </p>
                    </div>

                    {/* Upload button or status bar */}
                    <div>
                      {uploaded ? (
                        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300">
                          <div className="truncate max-w-[170px]" title={uploaded.name}>
                            <p className="truncate font-medium text-slate-200">{uploaded.name}</p>
                            <span className="text-[11px] text-slate-500">
                              {(uploaded.size / 1024).toFixed(0)} KB
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => handleRemoveDoc(doc.key, e)}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Tanggalin ang file"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => triggerUpload(doc.key)}
                          className="w-full py-2.5 px-3 rounded-xl bg-slate-800/90 hover:bg-blue-600/20 text-slate-200 hover:text-blue-300 border border-slate-700/70 hover:border-blue-500/50 text-xs font-semibold flex items-center justify-center gap-2 transition-all duration-200 shadow-sm"
                        >
                          <UploadCloud className="w-4 h-4" />
                          <span>Upload File</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ========================================================================= */}
          {/* 4. CONDITIONAL AGRICULTURAL REQUIREMENTS (Dynamic Logic)                 */}
          {/* ========================================================================= */}
          {category === "agricultural" && (
            <section
              aria-labelledby="section-agricultural-docs"
              className="space-y-4 pt-2 transition-all duration-300 ease-in-out animate-in fade-in slide-in-from-top-4"
            >
              <div className="p-4 sm:p-5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 flex items-start sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                    <Sprout className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 id="section-agricultural-docs" className="text-base sm:text-lg font-bold text-emerald-300">
                      Mga Karagdagang Dokumento para sa Agricultural Zone (Environmentally Critical)
                    </h2>
                    <p className="text-xs text-emerald-400/80 mt-0.5">
                      Alinsunod sa Municipal Zoning Ordinance &amp; DENR Administrative Order para sa Poultry, Piggery, at Farm Structures.
                    </p>
                  </div>
                </div>

                <span className="hidden lg:inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider shrink-0">
                  Required for Agri
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {agriculturalDocs.map((doc) => {
                  const IconComponent = doc.icon;
                  const uploaded = documents[doc.key];

                  return (
                    <div
                      key={doc.key}
                      className={`relative rounded-2xl p-5 border flex flex-col justify-between transition-all duration-200 ${
                        uploaded
                          ? "bg-[#091C1B] border-emerald-500/50 shadow-sm"
                          : "bg-[#0F172A]/70 border-emerald-900/40 hover:border-emerald-600/50"
                      }`}
                    >
                      {/* Hidden input */}
                      <input
                        type="file"
                        ref={(el) => (fileInputRefs.current[doc.key] = el)}
                        onChange={(e) => handleFileUpload(doc.key, e.target.files?.[0] || null)}
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png"
                      />

                      <div>
                        {/* Top icon and badge */}
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                              uploaded
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                : "bg-emerald-950/40 text-emerald-400 border border-emerald-800/40"
                            }`}
                          >
                            <IconComponent className="w-5 h-5" />
                          </div>

                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                              uploaded
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1"
                                : "bg-emerald-950/50 text-emerald-400 border border-emerald-800/50"
                            }`}
                          >
                            {uploaded ? (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                Nai-upload
                              </>
                            ) : (
                              "Kailangan"
                            )}
                          </span>
                        </div>

                        {/* Title & Description */}
                        <h3 className="text-sm font-semibold text-white mb-1.5 leading-snug">
                          {doc.title}
                        </h3>
                        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4">
                          {doc.desc}
                        </p>
                      </div>

                      {/* Upload button or status bar */}
                      <div>
                        {uploaded ? (
                          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/90 border border-emerald-800/40 text-xs text-slate-300">
                            <div className="truncate max-w-[170px]" title={uploaded.name}>
                              <p className="truncate font-medium text-emerald-200">{uploaded.name}</p>
                              <span className="text-[11px] text-slate-500">
                                {(uploaded.size / 1024).toFixed(0)} KB
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => handleRemoveDoc(doc.key, e)}
                              className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title="Tanggalin ang file"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => triggerUpload(doc.key)}
                            className="w-full py-2.5 px-3 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-200 hover:text-white border border-emerald-800/60 hover:border-emerald-600/80 text-xs font-semibold flex items-center justify-center gap-2 transition-all duration-200 shadow-sm"
                          >
                            <UploadCloud className="w-4 h-4" />
                            <span>Upload File</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ========================================================================= */}
          {/* 5. VALIDATION BOX AND SUBMIT                                             */}
          {/* ========================================================================= */}
          <section className="pt-6 space-y-6">
            {/* Red Warning/Alert Box (Mockup Validation State) */}
            <div className="rounded-2xl p-5 sm:p-6 bg-[#2A1015]/80 border border-rose-800/70 shadow-[0_0_30px_-5px_rgba(244,63,94,0.15)] space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-rose-200 leading-snug">
                    Dapat kumpleto ang lahat ng patlang at mandatory requirements bago magpatuloy.
                  </h3>
                  <p className="text-xs text-rose-300/80 mt-1">
                    Pakisigurong nai-fill up ang lahat ng impormasyon at nai-attach ang mga kaukulang dokumento.
                  </p>
                </div>
              </div>

              {/* Red Pill Badges with 'X' Icons */}
              <div className="pt-2 border-t border-rose-900/50">
                <div className="text-[11px] font-semibold text-rose-300/70 uppercase tracking-wider mb-2.5">
                  Mga Nawawalang Patlang / Dokumento ({missingItems.length}):
                </div>
                <div className="flex flex-wrap gap-2">
                  {missingItems.length > 0 ? (
                    missingItems.map((item, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-950/90 text-rose-300 border border-rose-700/60 text-xs font-medium shadow-sm transition-transform hover:scale-105"
                      >
                        <X className="w-3.5 h-3.5 text-rose-400 stroke-[2.5]" />
                        <span>Nawawalang {item}</span>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-emerald-400 flex items-center gap-1.5 font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      Kumpleto na ang lahat ng kinakailangang impormasyon at dokumento!
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Action Footer with Primary Submit Button Aligned to the Right */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800/80">
              <div className="flex items-center gap-2 text-xs text-slate-400 text-center sm:text-left">
                <Info className="w-4 h-4 text-blue-400 shrink-0" />
                <span>
                  Ang pagsusumite ay awtomatikong maglo-load ng GIS slope &amp; hazard assessment sa susunod na hakbang.
                </span>
              </div>

              <div className="w-full sm:w-auto flex justify-end">
                <button
                  type="submit"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] border border-blue-400/40 shadow-[0_0_25px_rgba(59,130,246,0.4)] transition-all duration-200 group cursor-pointer"
                >
                  <span>Magpatuloy sa GIS Siting</span>
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                </button>
              </div>
            </div>
          </section>
        </form>
      </div>
    </div>
  );
}

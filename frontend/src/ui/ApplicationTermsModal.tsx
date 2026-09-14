import { useState, useMemo } from "react";
import "./ApplicationTermsModal.css";

interface ApplicationTermsModalProps {
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => void;
  isAlreadyAccepted?: boolean;
}

type TabType = "all" | "terms" | "privacy" | "consent";

export default function ApplicationTermsModal({
  isOpen,
  onAccept,
  onDecline,
  isAlreadyAccepted = false,
}: ApplicationTermsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("all");

  // Granular consent checkboxes
  const [agreedTerms, setAgreedTerms] = useState(true);
  const [agreedPrivacy, setAgreedPrivacy] = useState(true);
  const [agreedConsent, setAgreedConsent] = useState(true);

  const allAgreed = agreedTerms && agreedPrivacy && agreedConsent;

  const handleToggleAll = () => {
    if (allAgreed) {
      setAgreedTerms(false);
      setAgreedPrivacy(false);
      setAgreedConsent(false);
    } else {
      setAgreedTerms(true);
      setAgreedPrivacy(true);
      setAgreedConsent(true);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="app-terms-overlay" role="dialog" aria-modal="true" aria-labelledby="app-terms-title">
      <div className="app-terms-dialog">
        {/* Header */}
        <div className="app-terms-header">
          <div className="app-terms-header-left">
            <img src="/logo.png" alt="Bayan ng Luisiana" className="app-terms-logo" />
            <div>
              <h2 id="app-terms-title" className="app-terms-title">
                Mga Tuntunin, Kundisyon at Patakaran sa Privacy ng Datos
              </h2>
              <p className="app-terms-subtitle">
                Bayan ng Luisiana · MPDC, MEO &amp; Citizen Infrastructure Intake Portal
              </p>
            </div>
          </div>
          {isAlreadyAccepted && (
            <button
              type="button"
              className="new-app-modal-close"
              onClick={onAccept}
              aria-label="Isara ang Terms and Conditions"
              title="Isara"
            >
              ✕
            </button>
          )}
        </div>

        {/* Badges Bar */}
        <div className="app-terms-badges">
          <span className="app-terms-badge-pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Data Privacy Act (R.A. 10173)
          </span>
          <span className="app-terms-badge-pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            CLUP 2018–2027 &amp; Geohazards
          </span>
          <span className="app-terms-badge-pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            National Building Code (PD 1096)
          </span>
          <span className="app-terms-badge-pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <circle cx="8" cy="9" r="1" fill="currentColor" />
              <circle cx="15" cy="8" r="1" fill="currentColor" />
              <circle cx="10" cy="14" r="1" fill="currentColor" />
              <circle cx="15" cy="13" r="1" fill="currentColor" />
            </svg>
            Secure Cookies &amp; Reload-Safe Draft
          </span>
        </div>

        {/* Segmented Navigation Tabs */}
        <div className="app-terms-tabs-bar" role="tablist" aria-label="Mga Seksyon ng Patakaran">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "all"}
            className={`app-terms-tab-btn ${activeTab === "all" ? "active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            <span>Lahat ng Patakaran</span>
            <span className="app-terms-tab-badge">13</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "terms"}
            className={`app-terms-tab-btn ${activeTab === "terms" ? "active" : ""}`}
            onClick={() => setActiveTab("terms")}
          >
            <span>1. Mga Tuntunin sa Pag-aaplay</span>
            <span className="app-terms-tab-badge">4</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "privacy"}
            className={`app-terms-tab-btn ${activeTab === "privacy" ? "active" : ""}`}
            onClick={() => setActiveTab("privacy")}
          >
            <span>2. Data Privacy Policy (RA 10173)</span>
            <span className="app-terms-tab-badge">6</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "consent"}
            className={`app-terms-tab-btn ${activeTab === "consent" ? "active" : ""}`}
            onClick={() => setActiveTab("consent")}
          >
            <span>3. Mga Pahintulot at Cookies</span>
            <span className="app-terms-tab-badge">3</span>
          </button>
        </div>

        {/* Scrollable Terms & Policies Body */}
        <div className="app-terms-body">
          {/* ========================================================================= */}
          {/* PART 1: MGA TUNTUNIN SA PAG-AAPLAY (APPLICATION TERMS OF SERVICE)         */}
          {/* ========================================================================= */}
          {(activeTab === "all" || activeTab === "terms") && (
            <>
              <div className="app-terms-group-title">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span>Bahagi I: Mga Tuntunin at Kundisyon sa Pag-aaplay (Terms of Service)</span>
              </div>

              {/* Clause 1 */}
              <div className="app-terms-section">
                <div className="app-terms-section-header">
                  <span className="app-terms-section-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                  </span>
                  <span>1. Katumpakan ng Impormasyon at Dokumento (Authenticity of Submissions)</span>
                </div>
                <p>
                  Ipinapahayag at pinatutunayan ng aplikante na ang lahat ng datos at dokumentong isinumite sa form na ito—tulad ng Transfer Certificate of Title (TCT No.), Tax Declaration No., sukat ng lote (sq.m.), tinatayang badyet ng proyekto, at personal na mga detalye—ay totoo, wasto, legal, at hindi peke.
                </p>
                <p style={{ marginTop: 6 }}>
                  Ang pamemeke ng mga pampublikong dokumento o sadyang paglalagay ng maling deklarasyon ay may karampatang kaparusahan sa ilalim ng Artikulo 171 at 172 ng Binagong Kodigo Penal ng Pilipinas (Revised Penal Code) at magiging batayan para sa agarang pagbasura ng aplikasyon, pagbawi ng anumang inilabas na clearance, at pagsasampa ng kaukulang aksyong legal.
                </p>
              </div>

              {/* Clause 2 */}
              <div className="app-terms-section">
                <div className="app-terms-section-header">
                  <span className="app-terms-section-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                      <line x1="8" y1="2" x2="8" y2="18" />
                      <line x1="16" y1="6" x2="16" y2="22" />
                    </svg>
                  </span>
                  <span>2. Pagsunod sa Comprehensive Land Use Plan (CLUP 2018–2027) at Zoning Ordinance</span>
                </div>
                <p>
                  Ang bawat aplikasyon ay daraan sa automated spatial matching batay sa opisyal na Zoning Ordinance ng Bayan ng Luisiana. Sinusuri ng sistema kung ang lokasyon ng inyong proyekto ay tugma sa itinakdang sonang pang-lupa:
                </p>
                <ul>
                  <li><strong>Residential Zones (R-1, R-2):</strong> Para sa mga pribadong tahanan at subdibisyon.</li>
                  <li><strong>Commercial Zones (C-1, C-2):</strong> Para sa mga tindahan, restawran, at serbisyong pangnegosyo.</li>
                  <li><strong>Agricultural &amp; Agro-Industrial Zones:</strong> Para sa pagtatanim, poultry farms, at livestocks. Obligado ang pagsunod sa itinakdang 500-meter hanggang 1,000-meter environmental buffer zone mula sa mga pamayanan, paaralan, at pampublikong anyong tubig.</li>
                  <li><strong>Strict Protection Forest &amp; Watershed Zones:</strong> Mahigpit na ipinagbabawal ang anumang permanenteng konstruksyon nang walang Special Land Use Permit mula sa DENR at LGU.</li>
                </ul>
              </div>

              {/* Clause 3 */}
              <div className="app-terms-section">
                <div className="app-terms-section-header">
                  <span className="app-terms-section-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="4" y="2" width="16" height="20" rx="2" />
                      <line x1="9" y1="22" x2="9" y2="22.01" />
                      <line x1="15" y1="22" x2="15" y2="22.01" />
                    </svg>
                  </span>
                  <span>3. Pagsunod sa National Building Code ng Pilipinas (Presidential Decree No. 1096)</span>
                </div>
                <p>
                  Ang mga proyektong pang-imprastraktura ay dapat sumunod sa mga panuntunan sa road right-of-way (RROW), structural seismic design, fire clearance (R.A. 9514), at wastong setbacks. Ang zoning certificate mula sa MPDC ay paunang rekisito bago ang pormal na pag-isyu ng Building Permit ng Municipal Engineering Office (MEO).
                </p>
              </div>

              {/* Clause 4 */}
              <div className="app-terms-section">
                <div className="app-terms-section-header">
                  <span className="app-terms-section-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </span>
                  <span>4. Inspeksyon sa Lokasyon at Pinal na Beripikasyon (Ocular Site Verification)</span>
                </div>
                <p>
                  Ang pagsumite sa online portal ay nagbibigay ng opisyal na <strong>Tracking Reference Number (LUIS-ZC-XXXX)</strong> para sa digital queueing, subalit hindi ito agarang permiso sa pagtatayo. Sumasang-ayon ang aplikante na payagan ang mga itinalagang inspektor at inhinyero ng LGU Luisiana na magsagawa ng on-site ocular validation bago ibigay ang pinal na clearance.
                </p>
              </div>
            </>
          )}

          {/* ========================================================================= */}
          {/* PART 2: PATAKARAN SA PRIVACY NG DATOS (DATA PRIVACY POLICY - R.A. 10173)   */}
          {/* ========================================================================= */}
          {(activeTab === "all" || activeTab === "privacy") && (
            <>
              <div className="app-terms-group-title">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>Bahagi II: Patakaran sa Privacy ng Datos (Data Privacy Policy - R.A. 10173)</span>
              </div>

              {/* Clause 5 */}
              <div className="app-terms-section">
                <div className="app-terms-section-header">
                  <span className="app-terms-section-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </span>
                  <span>5. Pagsunod sa Data Privacy Act of 2012 (Republic Act No. 10173)</span>
                </div>
                <p>
                  Kinikilala ng Pamahalaang Bayan ng Luisiana ang karapatan sa privacy ng bawat mamamayan. Ang INFA-TRACK Portal ay mahigpit na sumusunod sa mga panuntunan ng National Privacy Commission (NPC). Tinitiyak namin na ang lahat ng personal at sensitibong impormasyon na ipinagkatiwala sa amin ay ligtas, may pananagutan, at naaayon sa batas.
                </p>
              </div>

              {/* Clause 6 */}
              <div className="app-terms-section">
                <div className="app-terms-section-header">
                  <span className="app-terms-section-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </span>
                  <span>6. Mga Datos na Kinokolekta (Personal &amp; Sensitive Information)</span>
                </div>
                <p>Upang maiproseso ang inyong aplikasyon, kinokolekta ng LGU ang mga sumusunod:</p>
                <ul>
                  <li><strong>Personal na Pagkakakilanlan:</strong> Buong pangalan ng aplikante o may-ari, contact phone/mobile number, email address, at tirahan.</li>
                  <li><strong>Sensitibong Dokumento ng Pag-aari:</strong> Titulo ng Lupa (TCT/OCT Number), Tax Declaration (TD Number), Resibo ng Amilyar (RPT Receipt), Barangay Clearance, at PLO/MERALCO Certification.</li>
                  <li><strong>Heograpikal at Spatial Data:</strong> Eksaktong koordinada (Latitude at Longitude), kinalalagyang barangay, at mga larawan ng lokasyon.</li>
                  <li><strong>Teknikal na Impormasyon:</strong> Public IP address ng internet provider, browser user-agent, at petsa/oras ng pagsang-ayon para sa security audit logging.</li>
                </ul>
              </div>

              {/* Clause 7 */}
              <div className="app-terms-section">
                <div className="app-terms-section-header">
                  <span className="app-terms-section-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </span>
                  <span>7. Eksklusibong Layunin sa Pagproseso ng Datos (Purpose Specification)</span>
                </div>
                <p>
                  Ang inyong mga datos ay gagamitin <strong>eksklusibo lamang</strong> para sa mga opisyal na gampanin ng Pamahalaang Bayan ng Luisiana:
                </p>
                <ul>
                  <li>Pagpapatunay ng legal na pagmamay-ari at pagsusuri ng zoning eligibility alinsunod sa CLUP;</li>
                  <li>Awtomatikong pag-screen sa GIS geohazard engine (PHIVOLCS active faults, MGB flood/landslide risk, Mt. Banahaw);</li>
                  <li>Opisyal na pakikipag-ugnayan ukol sa estado ng inyong aplikasyon at iskedyul ng ocular inspection;</li>
                  <li>Pag-iingat ng opisyal na municipal registry alinsunod sa mga patakaran ng Commission on Audit (COA) at DILG.</li>
                </ul>
                <p style={{ marginTop: 6, fontWeight: 500 }}>
                  <strong>Pahayag ng Integridad:</strong> Hindi kailanman ibebenta, ipapaupa, o ibabahagi ng LGU Luisiana ang inyong personal na impormasyon sa anumang komersyal o pribadong ikatlong partido nang walang legal na utos mula sa hukuman.
                </p>
              </div>

              {/* Clause 8 */}
              <div className="app-terms-section">
                <div className="app-terms-section-header">
                  <span className="app-terms-section-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <polyline points="9 12 11 14 15 10" />
                    </svg>
                  </span>
                  <span>8. Seguridad, Encryption, at Pag-iingat ng Datos (Data Security)</span>
                </div>
                <p>
                  Ang lahat ng data at dokumentong na-upload ay protektado ng TLS/SSL transport security encryption habang naglalakbay sa internet at naka-imbak sa secure PostgreSQL server na may mahigpit na Access Control Matrix. Tanging ang mga may opisyal na tungkulin sa MPDC at Municipal Engineering Office ang binibigyan ng pahintulot na buksan ang mga sensitibong talaan.
                </p>
              </div>

              {/* Clause 9 */}
              <div className="app-terms-section">
                <div className="app-terms-section-header">
                  <span className="app-terms-section-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                  </span>
                  <span>9. Mga Karapatan ng Mamamayan (Data Subject Rights)</span>
                </div>
                <p>Bilang may-ari ng datos alinsunod sa Seksyon 16 ng R.A. 10173, mayroon kayong:</p>
                <ul>
                  <li><strong>Karapatang Mabatid (Right to be Informed):</strong> Malaman kung paano ginagamit at pinoprotektahan ang inyong datos.</li>
                  <li><strong>Karapatang Sumuri (Right to Access):</strong> Humiling ng kopya ng inyong nakatalang impormasyon sa pamahalaan.</li>
                  <li><strong>Karapatang Magwasto (Right to Rectification):</strong> Ipawasto o i-update ang anumang maling impormasyon sa inyong rekord.</li>
                  <li><strong>Karapatang Magreklamo (Right to File a Complaint):</strong> Dumulog sa National Privacy Commission (NPC) sa pamamagitan ng <em>complaints@privacy.gov.ph</em> kung may hinala ng paglabag sa inyong privacy.</li>
                </ul>
              </div>

              {/* Clause 10: Official DPO Card */}
              <div className="app-terms-dpo-card">
                <div className="app-terms-dpo-head">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span>10. Data Protection Officer (DPO) · Bayan ng Luisiana</span>
                </div>
                <div style={{ fontSize: "0.8rem", lineHeight: 1.45 }}>
                  Para sa anumang katanungan o kahilingan sa pagwawasto ng inyong datos, maaari kayong sumangguni sa aming Data Protection Desk:
                </div>
                <div className="app-terms-dpo-grid">
                  <div><strong>Tanggapan:</strong> Municipal Planning &amp; Development Coordinator (MPDC)</div>
                  <div><strong>Lokasyon:</strong> Luisiana Municipal Hall, J.P. Rizal St., Luisiana, Laguna 4032</div>
                  <div><strong>Email:</strong> mpdc.luisiana@gmail.com</div>
                  <div><strong>Hotline:</strong> (049) 555-LUIS / LGU Luisiana IT Desk</div>
                </div>
              </div>
            </>
          )}

          {/* ========================================================================= */}
          {/* PART 3: MGA PAHINTULOT AT KASUNDUAN (CONSENT & TECHNOLOGY POLICIES)       */}
          {/* ========================================================================= */}
          {(activeTab === "all" || activeTab === "consent") && (
            <>
              <div className="app-terms-group-title">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>Bahagi III: Mga Pahintulot at Teknolohiya (Consent &amp; Technology Policies)</span>
              </div>

              {/* Clause 11 */}
              <div className="app-terms-section">
                <div className="app-terms-section-header">
                  <span className="app-terms-section-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </span>
                  <span>11. Pahintulot sa GIS Spatial Matching at Hazard Assessment</span>
                </div>
                <p>
                  Ipinagkakaloob ng aplikante ang buong pahintulot sa INFA-TRACK GIS engine na iproseso ang spatial coordinates (latitude at longitude) ng lote laban sa mga sumusunod na pambansang database:
                </p>
                <ul>
                  <li><strong>PHIVOLCS Active Faultlines:</strong> Pagsusuri sa lapit ng lote sa West Valley Fault at mga lokal na fault traces sa Laguna/Quezon.</li>
                  <li><strong>PHIVOLCS Ground Shaking:</strong> Pagsusuri sa PEIS VIII ground motion estimation para sa tamang seismic engineering design.</li>
                  <li><strong>MGB Flood &amp; Landslide Susceptibility:</strong> Pagtataya sa peligro ng baha (5-year, 25-year, 100-year rain return) at rain-induced landslide alinsunod sa datos ng Mines and Geosciences Bureau.</li>
                  <li><strong>Mount Banahaw Volcano Radial Zone:</strong> Pagtatala ng distansya (tinatayang 13.3 km hilaga ng summit) para sa disaster preparedness.</li>
                </ul>
              </div>

              {/* Clause 12 */}
              <div className="app-terms-section">
                <div className="app-terms-section-header">
                  <span className="app-terms-section-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                    </svg>
                  </span>
                  <span>12. Pahintulot sa Inter-Departmental Verification ng Dokumento</span>
                </div>
                <p>
                  Pinahihintulutan ng aplikante ang Tanggapan ng MPDC at Municipal Engineering Office na makipag-ugnayan sa Municipal Assessor's Office para sa beripikasyon ng Tax Declaration, sa Tanggapan ng Punong Barangay para sa Barangay Clearance, at sa kinauukulang utility provider (MERALCO) para sa kumpirmasyon ng service installation.
                </p>
              </div>

              {/* Clause 13 */}
              <div className="app-terms-section">
                <div className="app-terms-section-header">
                  <span className="app-terms-section-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="12" cy="12" r="10" />
                      <circle cx="8" cy="9" r="1" fill="currentColor" />
                      <circle cx="15" cy="8" r="1" fill="currentColor" />
                      <circle cx="10" cy="14" r="1" fill="currentColor" />
                      <circle cx="15" cy="13" r="1" fill="currentColor" />
                    </svg>
                  </span>
                  <span>13. Patakaran sa Secure Cookies, Session Storage, at Reload-Safe Drafts</span>
                </div>
                <p>Gumagamit ang INFA-TRACK ng mga secure browser storage technologies para sa:</p>
                <ul>
                  <li>
                    <strong>Tandaan ang Pagsang-ayon (Cookie Consent):</strong> Kapag tinanggap mo ang mga patakarang ito, itatala ito sa browser cookie upang <em>hindi na ito muling lumabas sa tuwing mag-a-apply ka</em>.
                  </li>
                  <li>
                    <strong>Auto-Save at Reload-Safe Drafts:</strong> Panatilihing buo at ligtas ang iyong mga naunang inilagay na impormasyon, piniling kategorya, at pinned coordinates kung sakaling aksidenteng ma-reload (F5) o ma-refresh ang iyong browser tab.
                  </li>
                  <li>
                    <strong>Audit Trail at Proteksyon laban sa Fraud:</strong> Naitatala ang tunay na pampublikong IP address ng iyong internet connection, browser environment, at eksaktong timestamp bilang patunay ng legal na pagsang-ayon (non-repudiation) alinsunod sa E-Commerce Act ng Pilipinas (R.A. 8792).
                  </li>
                </ul>
              </div>
            </>
          )}

          {/* ========================================================================= */}
          {/* GRANULAR CONSENT CHECKBOXES & SELECT ALL                                  */}
          {/* ========================================================================= */}
          <div className="app-terms-consent-box">
            <div className="app-terms-select-all-row">
              <span style={{ fontSize: "0.83rem", fontWeight: 700, color: "var(--apple-text, #1d1d1f)" }}>
                Kumpirmasyon at Pahintulot ng Aplikante (Citizen Consent):
              </span>
              <button
                type="button"
                className="app-terms-select-all-btn"
                onClick={handleToggleAll}
                title="Piliin o alisin ang tsek sa lahat ng kahon"
              >
                {allAgreed ? "Alisin ang Tsek sa Lahat" : "Piliin Lahat (Check All)"}
              </button>
            </div>

            <div className="app-terms-consent-checklist">
              {/* Consent 1: Terms & CLUP */}
              <label className="app-terms-check-item">
                <input
                  type="checkbox"
                  className="app-terms-checkbox-input"
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                />
                <div className="app-terms-check-content">
                  <span className="app-terms-check-title">
                    1. Mga Tuntunin at Pagsunod sa CLUP 2018–2027 &amp; Building Code (PD 1096)
                  </span>
                  <span className="app-terms-check-desc">
                    Pinatutunayan ko na totoo ang aking mga isinumiteng dokumento at sumasang-ayon ako sa ocular site inspection ng MPDC/MEO.
                  </span>
                </div>
              </label>

              {/* Consent 2: Data Privacy */}
              <label className="app-terms-check-item">
                <input
                  type="checkbox"
                  className="app-terms-checkbox-input"
                  checked={agreedPrivacy}
                  onChange={(e) => setAgreedPrivacy(e.target.checked)}
                />
                <div className="app-terms-check-content">
                  <span className="app-terms-check-title">
                    2. Patakaran sa Privacy ng Datos alinsunod sa Data Privacy Act (R.A. 10173)
                  </span>
                  <span className="app-terms-check-desc">
                    Pinahihintulutan ko ang Pamahalaang Bayan ng Luisiana na iproseso ang aking personal at sensitibong datos para sa opisyal na zoning evaluation.
                  </span>
                </div>
              </label>

              {/* Consent 3: GIS & Cookies */}
              <label className="app-terms-check-item">
                <input
                  type="checkbox"
                  className="app-terms-checkbox-input"
                  checked={agreedConsent}
                  onChange={(e) => setAgreedConsent(e.target.checked)}
                />
                <div className="app-terms-check-content">
                  <span className="app-terms-check-title">
                    3. Pahintulot sa GIS Geohazard Screening, Document Verification, at Cookies
                  </span>
                  <span className="app-terms-check-desc">
                    Sumasang-ayon ako sa automated spatial screening (PHIVOLCS/MGB) at paggamit ng secure cookies para hindi na muling lumabas ang kasunduang ito.
                  </span>
                </div>
              </label>
            </div>

            {isAlreadyAccepted ? (
              <div className="app-terms-already-banner">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>
                  Naka-save na ang inyong pagsang-ayon sa browser cookies at database ng pamahalaan.
                </span>
              </div>
            ) : (
              <div className="app-terms-cookie-note">
                ✓ Tandaan: Sa pag-click ng "Sumasang-ayon at Magpatuloy", mai-save ang cookie consent at hindi na ito muling hihingin sa susunod mong pag-aaplay.
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="app-terms-footer">
          {isAlreadyAccepted ? (
            <>
              <button
                type="button"
                className="app-terms-btn app-terms-btn-decline"
                onClick={onDecline}
                title="Bawiin o i-reset ang naunang pagsang-ayon"
              >
                Kanselahin ang Pagsang-ayon
              </button>
              <button
                type="button"
                className="app-terms-btn app-terms-btn-accept"
                onClick={onAccept}
              >
                <span>Naka-save na ang Pagsang-ayon (Isara)</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="app-terms-btn app-terms-btn-decline"
                onClick={onDecline}
                title="Bumalik sa dashboard kung hindi sumasang-ayon"
              >
                <span>← Tanggihan at Bumalik</span>
              </button>
              <button
                type="button"
                className="app-terms-btn app-terms-btn-accept"
                disabled={!allAgreed}
                onClick={onAccept}
                title={!allAgreed ? "Kailangang lagyan ng tsek ang lahat ng tatlong (3) kahon upang magpatuloy" : "Tanggapin ang mga patakaran at magpatuloy sa aplikasyon"}
              >
                <span>Sumasang-ayon at Magpatuloy</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

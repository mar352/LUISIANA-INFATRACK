-- =============================================================================
-- DATABASE SEED DATA: LUISIANA INFA-TRACK (IMPACT-LUISIANA)
-- Municipality of Luisiana, Laguna (PSGC 0403412000)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Official 23 Barangays of Luisiana, Laguna
-- -----------------------------------------------------------------------------
INSERT INTO barangays (id, code, name, zone, is_active, is_default) VALUES
('brgy-1',  'ZONE-1', 'Barangay Zone I (Poblacion)',   'Urban / Commercial Zone', true, true),
('brgy-2',  'ZONE-2', 'Barangay Zone II (Poblacion)',  'Urban / Commercial Zone', true, true),
('brgy-3',  'ZONE-3', 'Barangay Zone III (Poblacion)', 'Urban / Commercial Zone', true, true),
('brgy-4',  'ZONE-4', 'Barangay Zone IV (Poblacion)',  'Urban / Commercial Zone', true, true),
('brgy-5',  'ZONE-5', 'Barangay Zone V (Poblacion)',   'Urban / Commercial Zone', true, true),
('brgy-6',  'ZONE-6', 'Barangay Zone VI (Poblacion)',  'Urban / Commercial Zone', true, true),
('brgy-7',  'ZONE-7', 'Barangay Zone VII (Poblacion)', 'Urban / Commercial Zone', true, true),
('brgy-8',  'ZONE-8', 'Barangay Zone VIII (Poblacion)','Urban / Commercial Zone', true, true),
('brgy-9',  'DELAPAZ', 'De La Paz',                    'Rural Zone', true, true),
('brgy-10', 'SANANT',  'San Antonio',                  'Rural Zone', true, true),
('brgy-11', 'SANBUEN', 'San Buenaventura',             'Rural Zone', true, true),
('brgy-12', 'SANDIEG', 'San Diego',                    'Rural Zone', true, true),
('brgy-13', 'SANISID', 'San Isidro',                   'Rural Zone', true, true),
('brgy-14', 'SANJOSE', 'San Jose',                     'Rural Zone', true, true),
('brgy-15', 'SANJUAN', 'San Juan',                     'Rural Zone', true, true),
('brgy-16', 'SANLUIS', 'San Luis',                     'Rural Zone', true, true),
('brgy-17', 'SANPABL', 'San Pablo',                    'Rural Zone', true, true),
('brgy-18', 'SANPEDR', 'San Pedro',                    'Rural Zone', true, true),
('brgy-19', 'SANRAFA', 'San Rafael',                   'Rural Zone', true, true),
('brgy-20', 'SANROQU', 'San Roque',                    'Rural Zone', true, true),
('brgy-21', 'SANSALV', 'San Salvador',                 'Rural Zone', true, true),
('brgy-22', 'STODOM',  'Santo Domingo',                'Rural Zone', true, true),
('brgy-23', 'STOTOM',  'Santo Tomas',                  'Rural Zone', true, true)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    zone = EXCLUDED.zone,
    is_active = EXCLUDED.is_active;

-- -----------------------------------------------------------------------------
-- 2. System Masterlists (Standard Categories)
-- -----------------------------------------------------------------------------

-- Zoning Classifications
INSERT INTO system_masterlists (id, category, code, name, description, zone_group, is_active, is_default) VALUES
('zc-1', 'zoningClassifications', 'URBAN_COMM', 'Urban / Commercial Zone', 'Poblacion zones and commercial corridors', 'Commercial', true, true),
('zc-2', 'zoningClassifications', 'RES_LOW',    'Low-Density Residential (R-1)', 'Single-family residential lots', 'Residential', true, true),
('zc-3', 'zoningClassifications', 'RES_MED',    'Medium-Density Residential (R-2)', 'Multi-family residences & townhouses', 'Residential', true, true),
('zc-4', 'zoningClassifications', 'AGRI_PROD',  'Agricultural Production Zone', 'Farmlands, rice fields, and high-value crops', 'Agricultural', true, true),
('zc-5', 'zoningClassifications', 'AGRI_AGRO',  'Agro-Industrial Zone', 'Poultry, piggeries, feed mills, and processing', 'Industrial', true, true),
('zc-6', 'zoningClassifications', 'ECO_TOUR',   'Eco-Tourism & Protected Forest', 'Forest reserves, watershed, and eco-parks', 'Conservation', true, true),
('zc-7', 'zoningClassifications', 'INST_GOV',   'Institutional / Government Zone', 'Civic centers, schools, and hospitals', 'Institutional', true, true)
ON CONFLICT (category, code) DO NOTHING;

-- Building Types
INSERT INTO system_masterlists (id, category, code, name, description, is_active, is_default) VALUES
('bt-1', 'buildingTypes', 'RESIDENTIAL',    'Single Family Residential Dwelling', '1-2 Storey residential house', true, true),
('bt-2', 'buildingTypes', 'COMMERCIAL',     'Commercial / Retail Store', 'Store, sari-sari store, eatery, commercial building', true, true),
('bt-3', 'buildingTypes', 'AGRI_STRUCTURE', 'Agricultural Facility (Poultry/Swine/Barn)', 'Farm sheds, storage, livestock houses', true, true),
('bt-4', 'buildingTypes', 'INSTITUTIONAL',  'Institutional / Barangay Facility', 'Barangay outpost, chapel, community center', true, true),
('bt-5', 'buildingTypes', 'WAREHOUSE',      'Warehouse / Light Storage', 'Storage facility and trading depot', true, true)
ON CONFLICT (category, code) DO NOTHING;

-- Permit Categories
INSERT INTO system_masterlists (id, category, code, name, description, is_active, is_default) VALUES
('pc-1', 'permitCategories', 'ZONING_CERT',     'Locational Clearance / Zoning Certificate', 'Clearance for construction and business location', true, true),
('pc-2', 'permitCategories', 'LAND_TITLING',    'Land Titling & Verification Assistance', 'Assistance for property boundaries and registry', true, true),
('pc-3', 'permitCategories', 'RESEARCH_PERMIT', 'Socio-Economic & Planning Research', 'Permit for academic, survey, or GIS research', true, true)
ON CONFLICT (category, code) DO NOTHING;

-- Funding Sources
INSERT INTO system_masterlists (id, category, code, name, description, is_active, is_default) VALUES
('fs-1', 'fundingSources', '20_DEV_FUND', '20% Municipal Development Fund (20% DF)', 'Local Government 20% annual IRA allocation', true, true),
('fs-2', 'fundingSources', 'GEN_FUND',    'General Fund (GF)', 'Internal local revenue collections', true, true),
('fs-3', 'fundingSources', 'NATL_SUBSIDY','National Government Subsidy (LGSF / DPWH / DA)', 'National department capital assistance', true, true),
('fs-4', 'fundingSources', 'CALAMITY_FUND','Local Disaster Risk Reduction & Management Fund (LDRRMF)', '5% Calamity mitigation fund', true, true),
('fs-5', 'fundingSources', 'SEF',          'Special Education Fund (SEF)', 'DepEd public school infrastructure and repairs', true, true),
('fs-6', 'fundingSources', 'PRIVATE',      'Private / Proponent Funded', 'Privately funded construction or commercial project', true, true)
ON CONFLICT (category, code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Default System Config
-- -----------------------------------------------------------------------------
INSERT INTO system_config (id, version, maintenance_enabled, maintenance_message, updated_at)
VALUES (
    'master_config',
    '1.2.0',
    false,
    'Pansamantalang inaayos ang LUISIANA INFA-TRACK system upang mapabuti ang serbisyo. Mangyaring bumalik mamaya.',
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    version = EXCLUDED.version,
    updated_at = NOW();

-- -----------------------------------------------------------------------------
-- 4. Initial Staff Accounts (Matching auth.json / impact2024 seeds)
-- -----------------------------------------------------------------------------
INSERT INTO staff_accounts (
    username, name, employee_id, role, department, password_hash, password_salt, iterations, must_change_password, is_active
) VALUES
(
    'admin',
    'System Administrator',
    'ADMIN-001',
    'Super Admin',
    'ICT Office / Office of the Mayor',
    'rVCyvu5j0KtSv3skWEASD4pq0L4Gi9hBjshva6rHnHY=',
    'BXGOVE4T43tr6obYWv1Lcg==',
    120000,
    false,
    true
),
(
    'mpdc',
    'MPDC Planning Coordinator',
    'MPDC-001',
    'MPDC',
    'Municipal Planning & Development Coordinator',
    'InTMvGRKLGVQH5dpcuxE07e999wSRhzXiakmYLQz1xQ=',
    'TZclgInCg0j14MIgXypaSw==',
    120000,
    false,
    true
),
(
    'mpdc_admin',
    'MPDC Administrator',
    'MPDC-ADM-001',
    'Super Admin',
    'Municipal Planning & Development Coordinator',
    'InTMvGRKLGVQH5dpcuxE07e999wSRhzXiakmYLQz1xQ=',
    'TZclgInCg0j14MIgXypaSw==',
    120000,
    false,
    true
),
(
    'bon_pedron',
    'Bon Ryan P. Pedron',
    'MPDC-002',
    'MPDC',
    'Municipal Planning & Development Coordinator',
    'Xj8h3rguZgbAr6rERmacB3M5q/wjmbINfnv5ESUHAkw=',
    'JsXriihVAhf6Ms2c00QyMw==',
    120000,
    false,
    true
),
(
    'edward_romulo',
    'Edward B. Romulo, EnP.',
    'MPDC-003',
    'MPDC',
    'Municipal Planning & Development Coordinator',
    'W4IULRsiPoiNgpYLxmfMVfbpsUZMHAMHnfjL0gC1LF0=',
    '+vJBDguLZgEeFEmnAjy5Tw==',
    120000,
    false,
    true
),
(
    'randy_balasabas',
    'Randy A. Balasabas',
    'MPDC-004',
    'MPDC',
    'Municipal Planning & Development Coordinator',
    'SsgTwvmXyi/mYjEt5MgN763kfEj4U5+iGRxfYbXj5hM=',
    'SHf5mflYy0YF0ikp/u3ipA==',
    120000,
    false,
    true
),
(
    'joy_claricia',
    'Joy Anne O. Claricia',
    'MPDC-005',
    'MPDC',
    'Municipal Planning & Development Coordinator',
    'XDdldNIUwwF60oDHx1Peo/s7nhquSp0JYP2Kfdc8Oew=',
    'fp8MI6OUwGSbe5asqOT9mA==',
    120000,
    false,
    true
),
(
    'cher_zabate',
    'Engr. Cher L. Zabate',
    'MPDC-006',
    'MPDC',
    'Municipal Planning & Development Coordinator',
    '1smcqkUlvTUqSKgQ1x5fSZ8+MmXCcVZQy8C0f7q+hjU=',
    'SXYep0VlMjn4QZFFGbiZBg==',
    120000,
    false,
    true
),
(
    'rosette_delatorre',
    'Rosette Princess R. Dela Torre',
    'MPDC-007',
    'MPDC',
    'Municipal Planning & Development Coordinator',
    'nyPOpr0sfjASZ/39auiuNh3GTGOl3GaUDhi1P+NIkEk=',
    '7b6IU9w89per4Ejn2Xi9Ug==',
    120000,
    false,
    true
),
(
    'rhyn_cargar',
    'Rhyn Giorvic O. Cargar',
    'MPDC-008',
    'MPDC',
    'Municipal Planning & Development Coordinator',
    'L07VPitdLq5UhP8GaFiNogk3z8PWJp2ipqxePYmW5UY=',
    'ylQpmrTacP6gAM1IsLjWVA==',
    120000,
    false,
    true
),
(
    'engineer',
    'Municipal Engineer Office',
    'ENG-001',
    'Engineer',
    'Infrastructure & Engineering Office',
    'Vks0SgJTzxoWUT2Qfd5REWm0Lk8riViiWFq4u6rLKFI=',
    'ZB0FQi3kmoWzHl3zX6Y8rg==',
    120000,
    false,
    true
),
(
    'agriculture',
    'Municipal Agriculturist',
    'AGRI-001',
    'Agriculture',
    'Municipal Agriculture Office',
    'l8wGdQAA9IGpQ/my1BvSY2EWG86+rz7W0Xgk2RvNQ98=',
    'FrrX09TAXIpY9dIzbq6PHg==',
    120000,
    false,
    true
),
(
    'treasury',
    'Municipal Treasurer',
    'TREAS-001',
    'Treasury Office',
    'Municipal Treasury Office',
    '3tTb/8M2kwXksj6pYC1Hw9EKKLfu/0GXKX+RNw9saWs=',
    'SMQm2nQEin71lqslkgkxCw==',
    120000,
    false,
    true
),
(
    'negosyo',
    'Negosyo Center Staff',
    'BPLO-001',
    'Treasury Office',
    'Municipal Treasury Office',
    '3tTb/8M2kwXksj6pYC1Hw9EKKLfu/0GXKX+RNw9saWs=',
    'SMQm2nQEin71lqslkgkxCw==',
    120000,
    false,
    true
),
(
    'assessor',
    'Municipal Assessor',
    'ASSESS-001',
    'Assessor',
    'Municipal Assessor''s Office',
    '3tTb/8M2kwXksj6pYC1Hw9EKKLfu/0GXKX+RNw9saWs=',
    'SMQm2nQEin71lqslkgkxCw==',
    120000,
    false,
    true
),
(
    'barangay',
    'Barangay Officer',
    'BRGY-001',
    'Barangay Official',
    'Barangay Hall — Luisiana',
    'qbSpIYx/SBrcPzgTcc6i6ZV6Ou6Z8sibMYXkI5jHiNw=',
    '2kcL5cjoqQR9bHDCugw7mg==',
    120000,
    false,
    true
),
(
    'pengineer',
    'Private Design Engineer',
    'PENG-001',
    'Private Engineer',
    'Private Professional / Design Engineer',
    'LYf7mmVi+zCxTMq8gq59L8n0WaV+C+mzysgr99xGgzM=',
    'sk/wHvJkc5rLmiTye3pBdA==',
    120000,
    false,
    true
)
ON CONFLICT (username) DO NOTHING;

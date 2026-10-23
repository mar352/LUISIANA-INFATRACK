# LUISIANA INFA-TRACK — Database Architecture & Setup

This directory contains the production-grade **PostgreSQL** database schema, initial seed data, and migration automation for **LUISIANA INFA-TRACK** (Municipality of Luisiana, Laguna).

---

## 📁 File Structure

- [`schema.sql`](file:///c:/Users/kingking/Desktop/LUISIANA-INFATRACK-master/backend/sql/schema.sql): Complete DDL script (tables, constraints, foreign keys, indexes, triggers, PostGIS spatial support).
- [`seed.sql`](file:///c:/Users/kingking/Desktop/LUISIANA-INFATRACK-master/backend/sql/seed.sql): Initial data for the 23 official Luisiana barangays, system masterlists, master system config, and staff accounts.
- [`migrate.js`](file:///c:/Users/kingking/Desktop/LUISIANA-INFATRACK-master/backend/sql/migrate.js): Executable Node.js runner that connects to PostgreSQL, creates the database, applies `schema.sql`, applies `seed.sql`, and verifies tables.

---

## 🚀 How to Run the Database Setup

### Option 1: Using npm (Recommended)
From the `backend` directory:
```bash
npm run db:init
```

### Option 2: Direct Node execution
```bash
node sql/migrate.js
```

### Option 3: Manual PostgreSQL psql execution
```bash
# 1. Connect to postgres and create database
psql -U postgres -c "CREATE DATABASE luisiana_infatrack;"

# 2. Apply schema and seeds
psql -U postgres -d luisiana_infatrack -f sql/schema.sql
psql -U postgres -d luisiana_infatrack -f sql/seed.sql
```

---

## 🗄️ Database Tables Overview

| Domain | Table Name | Purpose |
|---|---|---|
| **System & Geo** | `barangays` | Official 23 Barangays of Luisiana, Laguna (PSGC 0403412000) |
| | `system_config` | Master system settings and maintenance mode |
| | `system_masterlists` | Masterlists for building types, zoning, permits, funding sources |
| **Auth & Security** | `staff_accounts` | LGU Staff & Official accounts (RBAC, PBKDF2 hash, lockouts) |
| | `user_sessions` | Active sessions with IP, device, and network location |
| | `audit_logs` | Comprehensive tamper-evident system audit trail |
| | `security_quarantine_logs`| File security detection & quarantine log |
| **Citizen & Permits**| `citizen_applications` | Citizen applications for Zoning Certificates, Titling, & Research |
| | `application_documents` | Uploaded attachments (TCT, Tax Dec, Clearances, RPT) |
| | `application_remarks` | Inter-office remarks, applicant notices, & action items |
| | `site_inspection_photos`| Geotagged street panoramas and site inspection photos |
| | `user_terms_consents` | Citizen terms of service & data privacy consent ledger |
| **Infrastructure** | `municipal_projects` | Infrastructure & Private Building projects for 3D WebGL map |
| | `project_milestones` | Milestone schedules and target completion dates |
| | `project_issues` | Bottlenecks, delays, and contractor issues |
| | `project_photos` | Progress photos with milestone associations and coordinates |
| | `project_activity_logs` | Real-time project change feed |
| **Planning Board** | `planning_proposals` | Inter-office & Barangay infrastructure proposals |
| | `proposal_comments` | Discussion threads with map/section anchors |
| | `proposal_approvals` | Official committee approvals and recommendations |
| | `proposal_votes` | Inter-office botohan / voting tallies |
| | `planning_events` | Calendar hearings, site visits, and deadlines |
| | `planning_meetings` | Meeting agendas, minutes, decisions, and documents |
| **DMS** | `municipal_documents` | Municipal records (CLUP, CDP, LDIP, AIP, engineering drawings) |
| | `document_versions` | Version history and file archive |
| **Public Engagement**| `citizen_engagements` | Public feedback, suggestions, and issue submissions |
| **Disaster & Risk** | `disaster_hazard_alerts`| Real-time alerts (Landslide risk, flood warnings) |
| | `disaster_backups` | System backup bundles and verification checksums |

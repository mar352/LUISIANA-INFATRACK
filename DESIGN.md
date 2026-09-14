---
name: LUISIANA-INFATRACK
description: Human-friendly municipal GIS and disaster monitoring system
colors:
  primary: "#151c28"
  accent: "#ffc107"
  surface-bg: "#faf9f5"
  surface-panel: "#f2f1ec"
  ink: "#151c28"
  ink-muted: "#737785"
  safe: "#16a34a"
  warn: "#d97706"
  danger: "#e03e3e"
typography:
  display:
    fontFamily: "'Chakra Petch', ui-sans-serif, sans-serif"
    fontSize: "3.65rem"
    fontWeight: 700
    lineHeight: 1.1
  headline:
    fontFamily: "'Chakra Petch', ui-sans-serif, sans-serif"
    fontSize: "2.55rem"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "'Chakra Petch', ui-sans-serif, sans-serif"
    fontSize: "1.7rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "'Chakra Petch', ui-sans-serif, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Chakra Petch', ui-sans-serif, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "2px"
  md: "4px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.accent}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.surface-panel}"
    rounded: "{rounded.md}"
    padding: "16px 20px"
  input:
    backgroundColor: "{colors.surface-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
---

# Design System

## Overview
LUISIANA-INFATRACK is designed around a **flat, human-friendly, high-legibility municipal design system**. It prioritizes immediate spatial comprehension and effortless usability for both technical municipal engineers and everyday citizens. The interface pairs a tactical Navy chrome with crisp Gold accents and high-contrast status colors, eliminating cognitive clutter and heavy decorative skeuomorphism.

## Colors
The color palette uses OKLCH color math under the hood to ensure consistent perceptual lightness and contrast across both light and dark operational modes.

- **Primary (`#151c28` / `oklch(0.2254 0.0257 261)`)**: Deep tactical navy chrome used for headers, active capsule containers, and prominent primary actions.
- **Accent (`#ffc107` / `oklch(0.8442 0.1722 84.9)`)**: High-visibility amber gold for focused states, selected tabs, map highlights, and key calls-to-action.
- **Surfaces**:
  - Light mode: Navy-tinted clean off-white (`oklch(0.972 0.008 261)`) and flat panel grey (`oklch(0.955 0.010 261)`).
  - Dark mode: Crisp deep navy slate (`oklch(0.20 0.025 261)`) and container panels (`oklch(0.24 0.028 261)`).
- **Ink & Typography**:
  - Main text (`--text` / `--ink`): Deep navy in light mode, high-contrast off-white (`oklch(0.93 0.012 261)`) in dark mode.
  - Secondary / Muted (`--muted`): Neutralized high-contrast slate (`oklch(0.48 0.022 261)` in light mode) guaranteeing minimum 4.5:1 body contrast.
- **Status Signals**:
  - Safe / Compliant (`#16a34a` / `oklch(0.52 0.12 152)`): Clean civic green.
  - Warning / Moderate Risk (`#d97706` / `oklch(0.70 0.15 55)`): Vibrant amber.
  - Danger / High Risk (`#e03e3e` / `oklch(0.55 0.19 28)`): Urgent, high-visibility hazard red.

## Typography
- **Core GIS & Tactical Dashboard**: Utilizes **Chakra Petch** across HUD headers, telemetry metrics, and coordinate overlays for precision GIS context.
- **Landing Page & Public Entry**: Utilizes **Inter** (`"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`) for a modern, flat, minimal, and highly legible municipal interface.
  - Display / H1: `-0.028em` tracking, bold weight (`2.4rem`–`4.2rem`).
  - Section Headlines (H2, including "Built for where Luisiana builds"): `-0.02em` tracking, semibold (`1.8rem`–`2.4rem`).
  - Subheadings (H3): `-0.012em` tracking, semibold (`1.05rem`–`1.25rem`).
  - Body & Lede: `-0.005em` tracking, regular (`0.9rem`–`1.1rem`), line height 1.6.
  - UI Labels & Buttons: `-0.008em` tracking, medium (`0.82rem`–`0.92rem`).

## Elevation
In alignment with the user's flat design preference, elevation is conveyed through **tonal surface layering, crisp 1px borders, and solid contrast** rather than diffuse drop shadows:

- **Surface 0 (Base)**: Map canvas and primary viewport background.
- **Surface 1 (Panels & Toolbars)**: Flat solid panels with clean 1px border stroke (`--stroke: oklch(0.225 0.026 261 / 0.14)`).
- **Surface 2 (Flyouts & Floating Controls)**: Floating tool capsules with crisp borders and minimal, tight ambient occlusion.
- **Surface 3 (Modals & Alerts)**: Crisp overlays over dark backdrop tint (`oklch(0.225 0.026 261 / 0.45)`).

## Components
- **Buttons**:
  - Primary: Flat navy with gold text and subtle hover fill shift.
  - Accent: Vibrant gold fill with deep navy text for decisive user commitments (e.g., "Submit Application", "Run Risk Analysis").
  - Ghost / Outline: Clean border with transparent fill and high-contrast text.
- **Cards & Containers**:
  - Flat surfaces with 2px–4px corner radii (`--radius-sq: 2px`).
  - Strict absence of thick side-stripe accent borders (`border-left: 4px`). Status is indicated via clean badge pills and explicit icon chips.
- **Inputs & Form Controls**:
  - Clear, accessible form fields with explicit labels above the field.
  - High-visibility focus rings in gold (`#ffc107`) for accessibility.
- **Status Badges**:
  - Compact, rounded chips combining an icon, colored background tint, and legible bold text.

## Do's and Don'ts

### Do
- Maintain high contrast: body text must always achieve ≥4.5:1 contrast against surface backgrounds.
- Keep the design clean and flat: communicate depth through surface tone differences and crisp 1px borders.
- Keep GIS tools and forms human-friendly with plain language and progressive disclosure.
- Ensure all interactive elements have visible keyboard focus indicators.
- Provide clear loading and empty states for map datasets and application queues.

### Don't
- Do not use thick side-stripe accent borders (`border-left: 4px solid ...`) on cards or alerts.
- Do not use decorative gradient text (`background-clip: text`) or heavy blurred glassmorphism.
- Do not rely solely on color to convey risk levels; always pair hazard colors with clear text or icons.
- Do not bury critical actions under deep nested submenus; keep frequent LGU workflows accessible in 1–2 clicks.
- Do not use low-contrast grey placeholder text or unreadable tiny text below 11px.

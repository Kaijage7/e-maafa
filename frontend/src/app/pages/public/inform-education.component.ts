import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PortalLabels } from './portal-i18n';

/**
 * PUBLIC, citizen-facing INFORM EDUCATION course (portal). Read-only guided course.
 *
 * An interactive guided course on the INFORM framework — "Understanding Risk for Decision-Making
 * in Tanzania". Six sequential sections — Hazard, Exposure, Sensitivity, Vulnerability, Coping
 * Capacity, Risk — each followed by a one-question gating quiz. Pass advances + marks complete;
 * fail offers review/retry. Completing section 6 shows the course-complete state. Each section
 * carries its educational content, interactive widgets, the progress tracker, and its quiz.
 *
 * Fully bilingual (English + Kiswahili). Every user-visible string renders in the active portal
 * language via PortalLabels.lang(): template chrome resolves through a component-local table
 * (`TR` + `t(key)`); data content carries bilingual `{ en, sw }` fields resolved through `tx(obj)`.
 */
@Component({
  selector: 'public-inform-education',
  standalone: true,
  imports: [RouterLink, NgTemplateOutlet],
  styles: [`
    :host { display:block; }
    .page { max-width:1100px; margin:0 auto; padding:6.5rem 1.5rem 4rem; color:#1a1a2e; font-size:16px; }
    .backlink { color:#60a5fa; text-decoration:none; font-size:0.88rem; display:inline-block; margin-bottom:1.4rem; }
    .backlink:hover { text-decoration:underline; }

    .gcourse-landing { display:flex; flex-direction:column; gap:24px; }

    /* ===== HEADER ===== */
    .gcourse-header { text-align:left; background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:24px 28px; box-shadow:0 1px 3px rgba(0,0,0,.06); }
    .ui-eyebrow { font-size:12px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#1976d2; margin-bottom:6px; }
    .ui-h1 { font-size:30px; font-weight:800; margin:0; color:#1a1a2e; }

    /* ===== PROGRESS TRACKER ===== */
    .progress-container { background:#fff; border:1px solid #e5e7eb; border-radius:14px; box-shadow:0 1px 3px rgba(0,0,0,.06); padding:24px 24px 18px; }
    .progress-tracker { display:flex; justify-content:space-between; max-width:100%; margin:0 auto 20px; padding:0 10px; }
    .progress-step { display:flex; flex-direction:column; align-items:center; flex:1; position:relative; }
    .step-circle { width:50px; height:50px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:20px; transition:all .3s ease; background:#e0e0e0; color:#757575; border:3px solid #e0e0e0; }
    .progress-step.current .step-circle { background:#1f6feb; color:#fff; border-color:#1f6feb; box-shadow:0 0 0 6px rgba(31,111,235,.15); }
    .progress-step.completed .step-circle { background:#43a047; color:#fff; border-color:#43a047; }
    .progress-step.pending .step-circle { background:#f5f5f5; color:#bdbdbd; border-color:#e0e0e0; }
    .step-label { margin-top:12px; text-align:center; max-width:140px; }
    .step-title { font-size:16px; font-weight:600; color:#333; margin-bottom:4px; }
    .step-subtitle { font-size:14px; color:#757575; line-height:1.4; }
    .progress-bar-container { width:100%; height:8px; background:#e0e0e0; border-radius:4px; overflow:hidden; max-width:100%; margin:0 auto 12px; }
    .progress-bar-fill { height:100%; background:#43a047; transition:width .5s ease; border-radius:4px; }
    .progress-text { text-align:center; font-size:16px; color:#666; font-weight:500; }

    /* ===== MAIN CONTENT ===== */
    .gcourse-main { min-height:500px; }
    .section-content { background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:40px; box-shadow:0 1px 3px rgba(0,0,0,.06); animation:fadeIn .4s ease; }
    @keyframes fadeIn { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
    @keyframes slideDown { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:translateY(0); } }
    @keyframes pulse { 0%,100% { opacity:.8; transform:scale(1); } 50% { opacity:1; transform:scale(1.1); } }
    @keyframes formulaReveal { from { opacity:0; transform:scale(.95) translateY(-20px); } to { opacity:1; transform:scale(1) translateY(0); } }

    /* ===== FOOTER NAVIGATION ===== */
    .gcourse-footer { background:#fff; border:1px solid #e5e7eb; border-radius:14px; box-shadow:0 1px 3px rgba(0,0,0,.06); padding:16px 24px; display:flex; justify-content:space-between; align-items:center; gap:16px; }
    .nav-button { padding:12px 24px; font:inherit; font-size:16px; font-weight:700; border:1px solid transparent; border-radius:8px; cursor:pointer; transition:all .2s ease; display:flex; align-items:center; gap:8px; }
    .nav-button.prev { background:#f3f4f6; color:#1a1a2e; border-color:#d1d5db; }
    .nav-button.prev:hover:not(:disabled) { background:#e5e7eb; }
    .nav-button.prev:disabled { opacity:.4; cursor:not-allowed; }
    .nav-button.quiz { background:#1f6feb; color:#fff; flex:1; justify-content:center; }
    .nav-button.quiz:hover { background:#1558c0; }
    .nav-button.next { background:#1f6feb; color:#fff; }
    .nav-button.next:hover { background:#1558c0; }
    .nav-button.complete { background:#43a047; color:#fff; flex:1; justify-content:center; }
    .nav-button.complete:hover { filter:brightness(.93); }

    /* ===== IMPORTANT NOTICE ===== */
    .important-notice { margin:8px auto 0; padding:20px 24px; background:#fff3cd; border:2px solid #ffc107; border-radius:12px; display:flex; gap:16px; align-items:flex-start; }
    .important-notice .notice-content { font-size:16px; line-height:1.6; color:#856404; }
    .important-notice .notice-content strong { font-weight:700; color:#533f03; }

    /* ===== SHARED SECTION STYLES ===== */
    .section-header { text-align:center; margin-bottom:40px; }
    .section-number { font-size:12px; font-weight:700; color:#1976d2; letter-spacing:1px; margin-bottom:12px; }
    .section-title { font-size:36px; font-weight:700; color:#1a1a2e; margin:0 0 16px 0; }
    .section-header h1 { font-size:36px; font-weight:bold; color:#1976d2; margin:0 0 8px 0; }
    .section-subtitle { font-size:20px; color:#666; font-weight:500; }
    .section-intro { font-size:20px; color:#666; max-width:700px; margin:0 auto; line-height:1.7; }
    .subsection-title { font-size:26px; font-weight:700; color:#1a1a2e; margin:0 0 12px 0; }
    .subsection-intro { font-size:18px; color:#666; margin:0 0 24px 0; line-height:1.7; }

    /* generic teaching boxes */
    .teaching-box { border-radius:16px; padding:28px 32px; margin:40px 0; display:flex; gap:24px; }
    .teaching-icon { font-size:48px; flex-shrink:0; }
    .teaching-content { flex:1; }

    /* SECTION 1 */
    .inform-definition { background:#e3f2fd; border:3px solid #1976d2; border-radius:12px; padding:0; margin:30px 0; overflow:hidden; }
    .definition-header { background:#1976d2; color:#fff; padding:12px 24px; }
    .definition-label { font-size:13px; font-weight:700; letter-spacing:.5px; }
    .definition-content { padding:24px 28px; }
    .definition-content h3 { margin:0 0 16px 0; font-size:24px; color:#0d47a1; }
    .definition-content p { margin:0 0 12px 0; font-size:18px; line-height:1.8; color:#333; }
    .definition-content p:last-child { margin-bottom:0; }
    .definition-content strong { color:#0d47a1; font-weight:700; }
    .teaching-box.critical { background:#fff3cd; border:4px solid #ffc107; box-shadow:0 6px 20px rgba(255,193,7,.2); }
    .teaching-content h4 { margin:0 0 12px 0; font-size:14px; color:#856404; font-weight:700; letter-spacing:1px; }
    .teaching-divider { width:60px; height:4px; background:#ffc107; margin-bottom:16px; border-radius:2px; }
    .teaching-box.critical .teaching-content h3 { margin:0 0 16px 0; font-size:28px; color:#533f03; font-weight:700; }
    .teaching-emphasis { font-size:19px; font-weight:600; color:#856404; margin:0 0 12px 0; }
    .teaching-list { margin:0 0 20px 0; padding-left:24px; list-style:none; }
    .teaching-list li { margin-bottom:10px; font-size:18px; color:#333; line-height:1.7; position:relative; padding-left:20px; }
    .teaching-list li::before { content:"\\25CF"; position:absolute; left:0; color:#ffc107; font-size:12px; }
    .teaching-example { background:rgba(255,255,255,.7); padding:16px 20px; border-radius:8px; border-left:4px solid #ff9800; font-size:17px; color:#333; line-height:1.8; }
    .teaching-example strong { color:#f57c00; }
    .tanzania-hazards { margin:50px 0; }
    .category-selector { display:flex; gap:16px; margin-bottom:32px; flex-wrap:wrap; }
    .category-button { flex:1; min-width:200px; padding:20px 24px; border:3px solid #ddd; border-radius:12px; background:#fff; cursor:pointer; transition:all .3s ease; display:flex; align-items:center; gap:12px; font:inherit; font-size:18px; font-weight:600; }
    .category-button:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,.1); }
    .category-button.active { box-shadow:0 8px 24px rgba(0,0,0,.15); }
    .category-count { margin-left:auto; font-size:14px; opacity:.8; }
    .hazard-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:20px; margin-bottom:30px; }
    .hazard-card { background:#fff; border:3px solid #e0e0e0; border-radius:12px; padding:20px; cursor:pointer; transition:all .3s ease; display:flex; align-items:center; gap:16px; }
    .hazard-card:hover { transform:translateY(-3px); box-shadow:0 6px 20px rgba(0,0,0,.12); }
    .hazard-card.selected { box-shadow:0 8px 24px rgba(0,0,0,.15); transform:translateY(-3px); }
    .hazard-info { flex:1; }
    .hazard-name { margin:0 0 8px 0; font-size:18px; font-weight:600; color:#333; line-height:1.4; }
    .hazard-frequency { display:flex; flex-direction:column; gap:4px; }
    .frequency-label { font-size:14px; color:#999; font-weight:500; }
    .frequency-value { font-size:16px; color:#666; font-weight:500; }
    .hazard-details { background:#f5f5f5; border-left:6px solid #1976d2; border-radius:8px; padding:24px 28px; margin-top:20px; animation:slideDown .3s ease; }
    .hazard-details h4 { margin:0 0 20px 0; font-size:20px; color:#333; }
    .detail-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:16px; }
    .detail-item { display:flex; flex-direction:column; gap:6px; }
    .detail-label { font-size:15px; color:#999; font-weight:600; }
    .detail-value { font-size:17px; color:#333; font-weight:500; }
    .no-impact-notice { background:#e8f5e9; border:3px solid #43a047; border-radius:12px; padding:20px 24px; margin:40px 0; display:flex; gap:16px; align-items:flex-start; }
    .no-impact-notice .notice-text { font-size:17px; line-height:1.8; color:#1b5e20; }
    .no-impact-notice .notice-text strong { color:#2e7d32; font-weight:700; }
    .notice-emphasis-inline { display:block; margin-top:12px; font-style:italic; font-weight:600; color:#388e3c; }
    .historical-timeline { margin:50px 0; }
    .timeline-chart { background:#fff; border:2px solid #e0e0e0; border-radius:12px; padding:30px; margin:24px 0; }
    .timeline-year-labels { display:flex; justify-content:space-between; margin-bottom:16px; padding:0 10px; }
    .year-label { font-size:14px; font-weight:600; color:#666; }
    .timeline-events { display:flex; flex-direction:column; gap:20px; }
    .event-row { display:flex; align-items:center; gap:16px; }
    .event-type { min-width:140px; font-size:16px; font-weight:600; color:#333; }
    .event-markers { flex:1; height:32px; background:#f5f5f5; border-radius:16px; position:relative; }
    .event-marker { position:absolute; top:50%; transform:translateY(-50%); height:20px; min-width:8px; border-radius:10px; }
    .event-row.floods .event-marker { background:#2196f3; }
    .event-row.drought .event-marker { background:#ff9800; }
    .event-row.epidemics .event-marker { background:#f44336; }
    .event-row.cyclones .event-marker { background:#9c27b0; }
    .timeline-note { font-size:16px; color:#666; font-style:italic; padding:16px 20px; background:#f5f5f5; border-radius:8px; margin-top:16px; }
    .section-summary { border-radius:16px; padding:28px 32px; margin:50px 0 0 0; }
    .section-summary.purple { background:#f3e5f5; border:3px solid #7b1fa2; }
    .section-summary.purple h4, .section-summary.purple h3 { margin:0 0 20px 0; font-size:22px; color:#4a148c; font-weight:700; }
    .section-summary.purple ul { margin:0 0 24px 0; padding-left:24px; list-style:none; }
    .section-summary.purple li { margin-bottom:12px; font-size:18px; color:#4a148c; line-height:1.7; position:relative; padding-left:8px; }
    .section-summary.purple strong { font-weight:700; color:#6a1b9a; }
    .next-preview { background:rgba(255,255,255,.7); padding:16px 20px; border-radius:8px; border-left:4px solid #9c27b0; font-size:17px; color:#4a148c; }
    .next-preview strong { color:#6a1b9a; }

    /* shared definition boxes (sections 2-6) */
    .definition-box { border-radius:16px; padding:32px; margin:40px 0; display:flex; gap:24px; align-items:flex-start; }
    .definition-box .definition-icon { font-size:48px; flex-shrink:0; }
    .definition-box .definition-content h3 { font-size:26px; margin-bottom:16px; font-weight:bold; }
    .definition-box .inform-definition-p { font-size:17px; line-height:1.7; margin-bottom:12px; background:#fff; padding:16px; border-radius:8px; }
    .definition-box .definition-explanation { font-size:16px; line-height:1.6; color:#333; margin-bottom:16px; }
    .inform-note-small { background:#e3f2fd; padding:12px 16px; border-radius:6px; border-left:4px solid #1976d2; font-size:14px; line-height:1.5; color:#555; }

    /* SECTION 2 */
    .exposure-definition { background:#e3f2fd; border:4px solid #f57c00; box-shadow:0 6px 20px rgba(245,124,0,.15); }
    .exposure-definition .definition-content h3 { color:#f57c00; }
    .exposure-definition .inform-definition-p { border-left:5px solid #f57c00; }
    .concept-section, .exposure-data-section { margin:50px 0; }
    .concept-section h2, .exposure-data-section h2 { font-size:28px; font-weight:bold; color:#333; margin-bottom:16px; }
    .concept-intro, .data-intro { font-size:17px; line-height:1.6; color:#555; margin-bottom:28px; }
    .overlay-visualization { background:#fff; border:3px solid #e0e0e0; border-radius:16px; padding:32px; margin:32px 0; box-shadow:0 4px 16px rgba(0,0,0,.08); }
    .overlay-controls { display:flex; gap:16px; margin-bottom:32px; justify-content:center; flex-wrap:wrap; }
    .overlay-step-button { display:flex; flex-direction:column; align-items:center; gap:8px; padding:16px 24px; border:3px solid #ddd; border-radius:12px; background:#fff; cursor:pointer; transition:all .3s ease; font:inherit; font-size:14px; font-weight:600; min-width:140px; }
    .overlay-step-button .step-title-s { font-size:13px; text-align:center; }
    .overlay-step-button:hover { transform:translateY(-2px); box-shadow:0 4px 12px rgba(0,0,0,.15); }
    .overlay-step-button.active { box-shadow:0 6px 20px rgba(0,0,0,.2); }
    .overlay-display { position:relative; height:300px; background:#f5f5f5; border-radius:12px; overflow:hidden; margin-bottom:24px; }
    .overlay-layer { position:absolute; top:0; left:0; width:100%; height:100%; opacity:0; transition:opacity .5s ease; }
    .overlay-layer.visible { opacity:1; }
    .layer-label { position:absolute; top:16px; left:16px; color:#fff; padding:8px 16px; border-radius:8px; font-weight:bold; font-size:14px; z-index:10; box-shadow:0 2px 8px rgba(0,0,0,.2); }
    .hazard-layer .layer-label { background:#d32f2f; } .population-layer .layer-label { background:#1976d2; } .exposure-layer .layer-label { background:#f57c00; }
    .layer-pattern { width:100%; height:100%; }
    .hazard-pattern { background:rgba(211,47,47,.16); } .population-pattern { background:rgba(25,118,210,.16); } .exposure-pattern { background:rgba(245,124,0,.18); }
    .overlay-explanation { text-align:center; padding:20px; background:#f9f9f9; border-radius:8px; font-size:16px; color:#555; }
    .overlay-formula { margin-top:12px; font-size:18px; color:#f57c00; font-weight:bold; }
    .exposure-types { background:#fff3e0; border:4px solid #f57c00; box-shadow:0 6px 20px rgba(245,124,0,.15); margin:50px 0; }
    .exposure-types .teaching-content h3 { font-size:26px; color:#e65100; margin-bottom:24px; font-weight:bold; }
    .exposure-comparison { display:grid; grid-template-columns:1fr auto 1fr; gap:32px; align-items:start; background:#fff; padding:28px; border-radius:12px; margin-bottom:20px; }
    .exposure-type-header { display:flex; align-items:center; gap:12px; margin-bottom:16px; }
    .exposure-type h4 { font-size:20px; color:#e65100; margin:0; font-weight:bold; }
    .exposure-type p { margin:12px 0; line-height:1.6; color:#333; }
    .example-text { font-style:italic; color:#666; background:#fff8e1; padding:10px; border-radius:6px; border-left:3px solid #ffa726; }
    .why-important { font-weight:600; color:#e65100; }
    .divider-vertical { width:2px; background:#f57c00; align-self:stretch; }
    .inform-note { background:#e3f2fd; padding:16px 20px; border-radius:8px; border-left:5px solid #1976d2; font-size:15px; line-height:1.6; color:#333; }
    .districts-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:20px; margin-bottom:32px; }
    .district-card { background:#fff; border:3px solid #e0e0e0; border-radius:12px; padding:20px; cursor:pointer; transition:all .3s ease; }
    .district-card:hover { transform:translateY(-3px); box-shadow:0 6px 20px rgba(0,0,0,.12); border-color:#f57c00; }
    .district-card.selected { border-color:#f57c00; background:#fff3e0; box-shadow:0 6px 24px rgba(245,124,0,.2); }
    .district-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
    .district-header h4 { font-size:18px; font-weight:bold; color:#333; margin:0; }
    .hazard-badge { color:#fff; padding:4px 12px; border-radius:6px; font-size:12px; font-weight:bold; text-transform:uppercase; }
    .district-metric { margin:16px 0; }
    .metric-value { font-size:28px; font-weight:bold; color:#f57c00; }
    .metric-label { font-size:13px; color:#666; text-transform:uppercase; letter-spacing:.5px; margin-top:4px; }
    .district-percentage { margin-top:16px; }
    .percentage-bar { width:100%; height:12px; background:#e0e0e0; border-radius:6px; overflow:hidden; margin-bottom:8px; }
    .percentage-fill { height:100%; transition:width .5s ease; border-radius:6px; background:#f57c00; }
    .percentage-text { font-size:14px; font-weight:600; color:#f57c00; text-align:right; }
    .district-details { background:#fff3e0; border:3px solid #f57c00; border-radius:12px; padding:28px; animation:slideDown .3s ease; }
    .district-details h3 { font-size:22px; color:#e65100; margin-bottom:20px; font-weight:bold; }
    .details-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:20px; margin-bottom:20px; }
    .details-grid .detail-item { background:#fff; padding:16px; border-radius:8px; border-left:4px solid #f57c00; }
    .details-grid .detail-label { font-size:13px; color:#666; text-transform:uppercase; letter-spacing:.5px; margin-bottom:8px; }
    .details-grid .detail-value { font-size:22px; font-weight:bold; color:#f57c00; }
    .detail-description { background:#fff; padding:16px; border-radius:8px; font-size:15px; line-height:1.6; color:#333; }
    .tanzania-challenge { background:#fff9c4; border:4px solid #ffc107; box-shadow:0 6px 20px rgba(255,193,7,.2); margin:50px 0; }
    .tanzania-challenge .teaching-content h3 { font-size:26px; color:#f57f17; margin-bottom:24px; font-weight:bold; }
    .challenge-formula { display:flex; align-items:center; justify-content:center; gap:16px; background:#fff; padding:24px; border-radius:12px; margin-bottom:24px; flex-wrap:wrap; }
    .formula-part { background:#e3f2fd; padding:12px 20px; border-radius:8px; font-weight:600; color:#1976d2; border:2px solid #1976d2; }
    .formula-operator { font-size:24px; font-weight:bold; color:#f57c00; }
    .formula-result { background:#ffebee; padding:12px 20px; border-radius:8px; font-weight:bold; color:#c62828; border:3px solid #c62828; }
    .challenge-example { background:#fff; padding:20px; border-radius:12px; margin-bottom:20px; }
    .challenge-example strong { color:#f57f17; font-size:18px; display:block; margin-bottom:12px; }
    .challenge-example ul { margin:12px 0; padding-left:24px; }
    .challenge-example li { margin:8px 0; line-height:1.6; }
    .challenge-note { font-size:16px; line-height:1.7; color:#333; background:#fff8e1; padding:16px; border-radius:8px; border-left:5px solid #f57c00; }
    .notice-box { border-radius:16px; padding:28px 32px; margin:50px 0; display:flex; gap:24px; align-items:flex-start; }
    .exposure-notice { background:#e8f5e9; border:4px solid #43a047; box-shadow:0 6px 20px rgba(67,160,71,.15); }
    .exposure-notice .notice-content h4 { font-size:22px; color:#2e7d32; margin-bottom:16px; font-weight:bold; }
    .exposure-notice .notice-content p { line-height:1.7; color:#333; margin:12px 0; }
    .notice-list { list-style:none; padding:20px; margin:16px 0; background:#fff; border-radius:8px; }
    .notice-list li { margin:12px 0; font-size:16px; line-height:1.6; }
    .notice-emphasis-box { background:#fff9c4; padding:16px; border-radius:8px; border-left:5px solid #ffc107; font-weight:600; margin-top:16px; }

    /* shared purple summary (sections 2-5) with check icons */
    .summary-purple { background:#f3e5f5; border:4px solid #7b1fa2; border-radius:16px; padding:32px; margin:50px 0; box-shadow:0 6px 20px rgba(123,31,162,.15); }
    .summary-purple h3 { font-size:26px; color:#6a1b9a; margin-bottom:24px; font-weight:bold; text-align:center; }
    .summary-points { background:#fff; padding:24px; border-radius:12px; margin-bottom:24px; }
    .summary-point { display:flex; gap:16px; align-items:flex-start; margin:16px 0; padding:12px; background:#f9f9f9; border-radius:8px; transition:all .3s ease; }
    .summary-point:hover { background:#f3e5f5; transform:translateX(4px); }
    .check-icon { color:#43a047; font-size:22px; font-weight:bold; flex-shrink:0; }
    .check-icon::before { content:"\\2713"; }
    .point-text { line-height:1.6; color:#333; font-size:16px; }
    .next-section-preview { background:#ede7f6; padding:24px; border-radius:12px; border-left:6px solid #7b1fa2; }
    .next-section-preview h4 { color:#6a1b9a; font-size:20px; margin-bottom:12px; font-weight:bold; }
    .next-section-preview p { line-height:1.7; color:#333; font-size:15px; }

    /* SECTION 3 */
    .sensitivity-definition { background:#fff3e0; border:4px solid #ff9800; box-shadow:0 6px 20px rgba(255,152,0,.15); }
    .sensitivity-definition .definition-content h3 { color:#e65100; }
    .sensitivity-definition .inform-definition-p { border-left:5px solid #ff9800; }
    .comparison-section { margin:50px 0; }
    .comparison-section h2 { font-size:28px; font-weight:bold; color:#333; margin-bottom:16px; }
    .comparison-intro { font-size:17px; line-height:1.6; color:#555; margin-bottom:32px; }
    .comparison-controls { display:flex; gap:16px; margin-bottom:32px; justify-content:center; flex-wrap:wrap; }
    .comparison-button { display:flex; align-items:center; gap:10px; padding:14px 24px; border:3px solid #ddd; border-radius:12px; background:#fff; cursor:pointer; transition:all .3s ease; font:inherit; font-size:15px; font-weight:600; min-width:200px; justify-content:center; color:#333; }
    .comparison-button:hover { transform:translateY(-2px); box-shadow:0 4px 12px rgba(0,0,0,.15); }
    .comparison-button.active { box-shadow:0 6px 20px rgba(0,0,0,.2); }
    .comparison-display { display:flex; gap:32px; align-items:center; margin:32px 0; }
    .comparison-display.single { justify-content:center; }
    .comparison-display.side-by-side { justify-content:space-between; }
    .district-column { flex:1; background:#fff; border:4px solid #e0e0e0; border-radius:16px; overflow:hidden; box-shadow:0 6px 20px rgba(0,0,0,.1); animation:slideDown .3s ease; max-width:500px; }
    .district-title { color:#fff; padding:16px; text-align:center; font-size:20px; font-weight:bold; }
    .hazard-same { background:#fff9c4; padding:16px; text-align:center; font-size:16px; border-bottom:3px solid #ffc107; }
    .factors-list { padding:20px; }
    .factor-item { display:flex; gap:12px; align-items:flex-start; padding:16px; margin:12px 0; border-radius:8px; border-left:5px solid; }
    .factor-item.high { background:#ffebee; border-color:#d32f2f; }
    .factor-item.low { background:#e8f5e9; border-color:#43a047; }
    .factor-item .factor-content { flex:1; }
    .factor-item .factor-content strong { display:block; font-size:16px; margin-bottom:4px; color:#333; }
    .factor-item .factor-content p { font-size:14px; line-height:1.5; color:#666; margin:0; }
    .outcome-box { padding:24px; color:#fff; text-align:center; }
    .outcome-label { font-size:24px; font-weight:bold; margin-bottom:8px; }
    .outcome-type { font-size:16px; margin-bottom:16px; opacity:.9; }
    .outcome-details { font-size:14px; line-height:1.6; background:rgba(0,0,0,.15); padding:12px; border-radius:6px; margin:0; }
    .comparison-arrow { font-size:48px; color:#ff9800; font-weight:bold; flex-shrink:0; animation:pulse 2s infinite; }
    .factors-section { margin:50px 0; }
    .factors-section h2 { font-size:28px; font-weight:bold; color:#333; margin-bottom:16px; }
    .factors-intro { font-size:17px; color:#555; margin-bottom:28px; }
    .factors-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:24px; }
    .sensitivity-factor-card { background:#fff; border:3px solid #e0e0e0; border-radius:12px; overflow:hidden; cursor:pointer; transition:all .3s ease; box-shadow:0 4px 12px rgba(0,0,0,.08); }
    .sensitivity-factor-card:hover { transform:translateY(-4px); box-shadow:0 8px 24px rgba(0,0,0,.15); }
    .sensitivity-factor-card.selected { box-shadow:0 8px 28px rgba(0,0,0,.2); }
    .factor-header { color:#fff; padding:20px; display:flex; align-items:center; gap:16px; }
    .factor-header h4 { font-size:20px; margin:0; font-weight:bold; }
    .factor-body { padding:20px; }
    .factor-description { font-size:15px; line-height:1.6; color:#555; margin-bottom:16px; font-style:italic; }
    .indicators-list { background:#f9f9f9; padding:16px; border-radius:8px; margin-bottom:16px; }
    .indicator-item { display:flex; justify-content:space-between; align-items:center; padding:10px 12px; margin:8px 0; border-radius:6px; background:#fff; border-left:4px solid; }
    .indicator-item.risk-high { border-color:#d32f2f; background:#ffebee; }
    .indicator-item.risk-medium { border-color:#ff9800; background:#fff3e0; }
    .indicator-item.risk-low { border-color:#43a047; background:#e8f5e9; }
    .indicator-label { font-size:14px; color:#555; flex:1; }
    .indicator-value { font-size:16px; font-weight:bold; color:#333; }
    .tanzania-note { background:#e3f2fd; padding:12px; border-radius:6px; font-size:14px; line-height:1.5; color:#333; border-left:4px solid #1976d2; }
    .disasters-not-natural { background:#fff9c4; border:4px solid #ffc107; box-shadow:0 8px 24px rgba(255,193,7,.2); padding:36px; }
    .disasters-not-natural .teaching-content h3 { font-size:28px; color:#f57f17; margin-bottom:24px; font-weight:bold; text-align:center; }
    .insight-explanation { background:#fff; padding:28px; border-radius:12px; }
    .insight-emphasis { font-size:17px; line-height:1.7; color:#333; margin-bottom:16px; text-align:center; }
    .insight-main { font-size:18px; line-height:1.7; color:#333; margin:20px 0; font-weight:600; text-align:center; }
    .disaster-causes { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:20px; margin:28px 0; }
    .cause-item { background:#fff8e1; padding:20px; border-radius:10px; border:3px solid #ffb300; display:flex; flex-direction:column; align-items:center; text-align:center; transition:all .3s ease; }
    .cause-item:hover { transform:translateY(-4px); box-shadow:0 6px 20px rgba(255,179,0,.3); border-color:#ff6f00; }
    .cause-text strong { display:block; font-size:18px; color:#e65100; margin-bottom:8px; }
    .cause-text p { font-size:14px; line-height:1.5; color:#666; margin:0; }
    .insight-conclusion { background:#e8f5e9; padding:20px; border-radius:10px; border-left:6px solid #43a047; margin-top:24px; }
    .insight-conclusion strong { display:block; font-size:20px; color:#2e7d32; margin-bottom:12px; }
    .insight-conclusion p { font-size:16px; line-height:1.7; color:#333; margin:0; }

    /* SECTION 4 */
    .vulnerability-definition { background:#ffebee; border:4px solid #d32f2f; box-shadow:0 6px 20px rgba(211,47,47,.15); }
    .vulnerability-definition .definition-content h3 { color:#c62828; }
    .vulnerability-definition .inform-definition-p { border-left:5px solid #d32f2f; }
    .vulnerability-emphasis { background:#fff9c4; padding:16px; border-radius:8px; border-left:5px solid #ffc107; font-size:15px; line-height:1.6; color:#333; }
    .components-section { margin:50px 0; }
    .components-section h2 { font-size:28px; font-weight:bold; color:#333; margin-bottom:16px; }
    .components-intro { font-size:17px; color:#555; margin-bottom:28px; }
    .component-selector { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:20px; margin-bottom:32px; }
    .component-button { display:flex; align-items:center; gap:16px; padding:20px; border:3px solid #ddd; border-radius:12px; background:#fff; cursor:pointer; transition:all .3s ease; text-align:left; font:inherit; }
    .component-button:hover { transform:translateY(-3px); box-shadow:0 6px 20px rgba(0,0,0,.15); }
    .component-button.active { box-shadow:0 6px 24px rgba(0,0,0,.2); }
    .component-label strong { display:block; font-size:18px; color:#333; margin-bottom:6px; }
    .component-label p { font-size:14px; color:#666; margin:0; }
    .category-content { animation:slideDown .3s ease; }
    .category-content h3 { font-size:24px; font-weight:bold; color:#333; margin-bottom:12px; }
    .category-description { font-size:16px; color:#555; margin-bottom:24px; }
    .indicators-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:20px; }
    .indicator-card { background:#fff; border:3px solid #e0e0e0; border-radius:12px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,.08); transition:all .3s ease; }
    .indicator-card:hover { transform:translateY(-4px); box-shadow:0 8px 24px rgba(0,0,0,.15); }
    .indicator-header { color:#fff; padding:16px; display:flex; align-items:center; gap:12px; }
    .indicator-header h4 { font-size:18px; margin:0; font-weight:bold; }
    .indicator-body { padding:20px; }
    .indicator-metrics { background:#f9f9f9; padding:16px; border-radius:8px; margin-bottom:16px; }
    .metric-row { display:flex; justify-content:space-between; align-items:center; padding:10px 12px; margin:8px 0; border-radius:6px; background:#fff; border-left:4px solid; }
    .metric-row.severity-high { border-color:#d32f2f; background:#ffebee; }
    .metric-row.severity-medium { border-color:#ff9800; background:#fff3e0; }
    .metric-row.severity-low { border-color:#43a047; background:#e8f5e9; }
    .metric-name { font-size:14px; color:#555; flex:1; }
    .metric-value { font-size:16px; font-weight:bold; color:#333; }
    .indicator-impact { font-size:14px; line-height:1.6; color:#555; background:#e3f2fd; padding:12px; border-radius:6px; border-left:4px solid #1976d2; }
    .groups-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:20px; }
    .group-card { background:#fff; border:3px solid #e0e0e0; border-radius:12px; padding:20px; cursor:pointer; transition:all .3s ease; box-shadow:0 4px 12px rgba(0,0,0,.08); }
    .group-card:hover { transform:translateY(-3px); box-shadow:0 6px 20px rgba(0,0,0,.15); }
    .group-card.selected { box-shadow:0 8px 24px rgba(0,0,0,.2); }
    .group-header { display:flex; align-items:center; gap:16px; margin-bottom:12px; }
    .group-info { flex:1; }
    .group-info h4 { font-size:18px; color:#333; margin:0 0 6px 0; font-weight:bold; }
    .group-stats { display:flex; gap:8px; align-items:center; font-size:13px; color:#666; }
    .stat-divider { color:#ddd; }
    .group-details { margin-top:16px; padding-top:16px; border-top:2px solid #e0e0e0; animation:slideDown .3s ease; }
    .why-vulnerable { margin-bottom:16px; }
    .why-vulnerable strong { display:block; font-size:15px; color:#333; margin-bottom:8px; }
    .why-vulnerable ul { margin:0; padding-left:24px; }
    .why-vulnerable li { margin:6px 0; line-height:1.5; font-size:14px; color:#555; }
    .tanzania-context { background:#e3f2fd; padding:12px; border-radius:6px; font-size:14px; line-height:1.5; color:#333; border-left:4px solid #1976d2; }
    .formula-reveal-section { margin:60px 0; padding:40px; background:#e8eaf6; border-radius:20px; box-shadow:0 8px 28px rgba(63,81,181,.2); }
    .reveal-intro { text-align:center; margin-bottom:32px; }
    .reveal-intro h2 { font-size:32px; font-weight:bold; color:#3f51b5; margin-bottom:16px; }
    .reveal-intro p { font-size:18px; line-height:1.7; color:#333; margin:0 auto 24px; max-width:700px; }
    .reveal-button { padding:16px 32px; font:inherit; font-size:18px; font-weight:bold; color:#fff; border:none; border-radius:12px; cursor:pointer; transition:all .3s ease; box-shadow:0 4px 16px rgba(0,0,0,.2); }
    .reveal-button:hover { transform:translateY(-2px); box-shadow:0 6px 24px rgba(0,0,0,.3); }
    .formula-box { background:#fff; border:5px solid #3f51b5; border-radius:16px; padding:36px; margin-top:32px; animation:formulaReveal .6s ease; box-shadow:0 8px 32px rgba(63,81,181,.3); }
    .formula-title { text-align:center; font-size:20px; font-weight:bold; color:#3f51b5; margin-bottom:24px; text-transform:uppercase; letter-spacing:.5px; }
    .formula-equation { background:#1a237e; padding:32px; border-radius:12px; margin-bottom:20px; text-align:center; box-shadow:0 6px 20px rgba(26,35,126,.3); }
    .formula-text { font-size:32px; font-weight:bold; color:#fff; font-family:'Courier New',monospace; letter-spacing:1px; }
    .formula-text sup { font-size:20px; }
    .formula-highlight { text-align:center; margin:20px 0; }
    .highlight-arrow { font-size:36px; color:#d32f2f; font-weight:bold; }
    .highlight-arrow::before { content:"\\2193"; }
    .highlight-label-single { font-size:28px; font-weight:bold; color:#d32f2f; background:#ffebee; padding:12px 24px; border-radius:8px; display:inline-block; margin-top:8px; border:3px solid #d32f2f; }
    .formula-explanation { margin-top:32px; }
    .formula-explanation h4 { font-size:22px; color:#333; margin-bottom:20px; font-weight:bold; }
    .explanation-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:20px; margin-bottom:24px; }
    .explanation-item { background:#f5f5f5; padding:20px; border-radius:10px; border-left:5px solid #3f51b5; transition:all .3s ease; }
    .explanation-item:hover { background:#e8eaf6; transform:translateX(4px); }
    .explanation-text strong { display:block; font-size:16px; color:#3f51b5; margin-bottom:8px; }
    .explanation-text p { font-size:14px; line-height:1.6; color:#555; margin:0; }
    .formula-note { background:#fff9c4; padding:16px 20px; border-radius:8px; border-left:5px solid #ffc107; font-size:15px; line-height:1.7; color:#333; }
    .vulnerability-preexisting { background:#e8f5e9; border:4px solid #43a047; box-shadow:0 6px 20px rgba(67,160,71,.15); padding:36px; }
    .vulnerability-preexisting .teaching-content h3 { font-size:26px; color:#2e7d32; margin-bottom:28px; font-weight:bold; text-align:center; }
    .emphasis-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:20px; margin-bottom:28px; }
    .emphasis-item { background:#fff; padding:20px; border-radius:10px; border:3px solid #4caf50; transition:all .3s ease; }
    .emphasis-item:hover { transform:translateY(-4px); box-shadow:0 6px 20px rgba(76,175,80,.3); }
    .emphasis-text strong { display:block; font-size:17px; color:#2e7d32; margin-bottom:8px; }
    .emphasis-text p { font-size:14px; line-height:1.6; color:#555; margin:0; }
    .tanzania-example-box { background:#fff; padding:24px; border-radius:12px; border-left:6px solid #43a047; }
    .tanzania-example-box h4 { font-size:20px; color:#2e7d32; margin-bottom:16px; font-weight:bold; }
    .tanzania-examples { margin:0; padding-left:24px; }
    .tanzania-examples li { margin:12px 0; font-size:15px; line-height:1.7; color:#333; }

    /* SECTION 5 */
    .coping-definition { background:#e8f5e9; border:4px solid #43a047; box-shadow:0 6px 20px rgba(67,160,71,.15); }
    .coping-definition .definition-content h3 { color:#2e7d32; }
    .coping-definition .inform-definition-p { border-left:5px solid #43a047; }
    .capacity-note { background:#e3f2fd; padding:14px 18px; border-radius:8px; border-left:5px solid #1976d2; font-size:15px; line-height:1.6; color:#333; }
    .framework-section { margin:50px 0; }
    .framework-section h2 { font-size:28px; font-weight:bold; color:#333; margin-bottom:16px; }
    .framework-intro { font-size:17px; color:#555; margin-bottom:28px; }
    .phases-selector { display:flex; gap:16px; margin-bottom:32px; justify-content:center; flex-wrap:wrap; }
    .phase-button { display:flex; align-items:center; gap:10px; padding:14px 24px; border:3px solid #e0e0e0; border-radius:12px; background:#fff; cursor:pointer; transition:all .3s ease; font:inherit; font-size:16px; font-weight:600; color:#333; }
    .phase-button:hover { transform:translateY(-2px); box-shadow:0 4px 12px rgba(0,0,0,.15); border-color:#43a047; }
    .phase-button.active { border-color:#43a047; background:#e8f5e9; color:#2e7d32; }
    .phases-display { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:24px; }
    .phase-card { background:#fff; border:3px solid #e0e0e0; border-radius:12px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,.08); animation:slideDown .3s ease; }
    .phase-header { color:#fff; padding:20px; display:flex; align-items:center; gap:16px; }
    .phase-header h3 { font-size:22px; margin:0; font-weight:bold; }
    .phase-body { padding:24px; }
    .phase-description { font-size:16px; line-height:1.6; color:#555; margin-bottom:20px; font-style:italic; }
    .activities-list strong { display:block; font-size:16px; color:#333; margin-bottom:12px; }
    .activities-list ul { margin:0; padding-left:24px; }
    .activities-list li { margin:10px 0; line-height:1.6; font-size:15px; color:#555; }
    .capacity-components-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:24px; }
    .capacity-component-card { background:#fff; border:3px solid #e0e0e0; border-radius:12px; overflow:hidden; cursor:pointer; transition:all .3s ease; box-shadow:0 4px 12px rgba(0,0,0,.08); }
    .capacity-component-card:hover { transform:translateY(-4px); box-shadow:0 8px 24px rgba(0,0,0,.15); }
    .capacity-component-card.selected { box-shadow:0 8px 28px rgba(0,0,0,.2); }
    .component-header { color:#fff; padding:20px; display:flex; align-items:center; gap:16px; }
    .component-header h4 { font-size:20px; margin:0; font-weight:bold; }
    .component-body { padding:24px; }
    .component-description { font-size:15px; line-height:1.6; color:#555; margin-bottom:20px; font-style:italic; }
    .indicator-row { display:flex; justify-content:space-between; align-items:center; padding:10px 12px; margin:8px 0; border-radius:6px; background:#fff; border-left:4px solid; }
    .indicator-row.level-good { border-color:#43a047; background:#e8f5e9; }
    .indicator-row.level-medium { border-color:#ff9800; background:#fff3e0; }
    .indicator-row.level-low { border-color:#d32f2f; background:#ffebee; }
    .indicator-name { font-size:14px; color:#555; flex:1; }
    .indicator-status { font-size:15px; font-weight:bold; color:#333; }
    .component-note { background:#e3f2fd; padding:12px; border-radius:6px; font-size:14px; line-height:1.5; color:#333; border-left:4px solid #1976d2; }
    .comparison-display.coping { align-items:flex-start; }
    .scenario-column { flex:1; background:#fff; border:3px solid; border-radius:12px; overflow:hidden; box-shadow:0 6px 20px rgba(0,0,0,.1); animation:slideDown .3s ease; max-width:500px; }
    .scenario-column.high-capacity { border-color:#43a047; }
    .scenario-column.low-capacity { border-color:#d32f2f; }
    .scenario-title { color:#fff; padding:16px; text-align:center; font-size:18px; font-weight:bold; }
    .scenario-example { padding:20px; border-bottom:2px solid #f5f5f5; }
    .scenario-example:last-child { border-bottom:none; }
    .example-hazard { font-size:18px; font-weight:600; color:#333; margin-bottom:12px; }
    .example-outcome { padding:12px; border-radius:8px; font-size:16px; font-weight:bold; text-align:center; margin-bottom:16px; }
    .example-outcome.success { background:#e8f5e9; color:#2e7d32; border:2px solid #43a047; }
    .example-outcome.crisis { background:#ffebee; color:#c62828; border:2px solid #d32f2f; }
    .example-details { margin:0; padding-left:24px; }
    .example-details li { margin:8px 0; line-height:1.6; font-size:14px; color:#555; }
    .formula-highlights { display:flex; justify-content:center; gap:40px; margin:24px 0; flex-wrap:wrap; }
    .formula-highlights .formula-highlight { flex:1; min-width:200px; }
    .highlight-label-pill { font-size:20px; font-weight:bold; padding:10px 20px; border-radius:8px; display:inline-block; border:3px solid; }
    .highlight-label-pill.vulnerability { color:#d32f2f; background:#ffebee; border-color:#d32f2f; }
    .highlight-label-pill.capacity { color:#43a047; background:#e8f5e9; border-color:#43a047; }
    .capacity-teaching { background:#e8f5e9; border:4px solid #43a047; box-shadow:0 6px 20px rgba(67,160,71,.15); padding:36px; }
    .capacity-teaching .teaching-content h3 { font-size:26px; color:#2e7d32; margin-bottom:24px; font-weight:bold; text-align:center; }
    .teaching-scenario { background:#fff; padding:28px; border-radius:12px; }
    .teaching-scenario .scenario-title { font-size:20px; font-weight:bold; color:#2e7d32; text-align:center; margin-bottom:24px; }
    .scenario-comparison { display:grid; grid-template-columns:1fr auto 1fr; gap:24px; align-items:center; margin-bottom:24px; }
    .scenario-side h4 { font-size:18px; color:#333; margin-bottom:16px; text-align:center; }
    .scenario-side.without h4 { color:#d32f2f; }
    .scenario-side.with h4 { color:#43a047; }
    .scenario-outcomes { background:#f9f9f9; padding:20px; border-radius:10px; }
    .outcome-item { display:flex; align-items:center; gap:12px; margin:12px 0; padding:12px; background:#fff; border-radius:8px; }
    .outcome-text { font-size:15px; line-height:1.6; color:#333; }
    .scenario-divider { font-size:36px; font-weight:bold; color:#43a047; }
    .scenario-conclusion { background:#e8f5e9; padding:20px; border-radius:10px; border-left:6px solid #43a047; }
    .scenario-conclusion strong { display:block; font-size:20px; color:#2e7d32; margin-bottom:12px; }
    .scenario-conclusion p { font-size:16px; line-height:1.7; color:#333; margin:0; }

    /* SECTION 6 */
    .risk-definition { background:#e3f2fd; border:4px solid #1976d2; box-shadow:0 6px 20px rgba(25,118,210,.15); }
    .risk-definition .definition-content h3 { color:#0d47a1; }
    .risk-definition .inform-definition-p { border-left:5px solid #1976d2; }
    .risk-emphasis { background:#fff3e0; padding:16px; border-radius:8px; border-left:5px solid #ff9800; font-size:15px; line-height:1.6; color:#333; }
    .formula-reveal-section.complete { margin:50px 0; background:transparent; box-shadow:none; padding:0; }
    .formula-reveal-section.complete .reveal-intro { text-align:center; margin-bottom:32px; }
    .formula-reveal-section.complete .reveal-intro h2 { font-size:28px; font-weight:bold; color:#333; margin-bottom:16px; }
    .formula-reveal-section.complete .reveal-intro p { font-size:17px; line-height:1.6; color:#555; margin-bottom:24px; max-width:none; }
    .formula-reveal-section.complete .reveal-button { background:#1976d2; padding:16px 32px; }
    .formula-box.complete-formula { background:#f3e5f5; border:5px solid #7b1fa2; border-radius:20px; padding:40px; margin-top:32px; animation:formulaReveal .6s ease; box-shadow:0 8px 32px rgba(123,31,162,.2); }
    .complete-formula .formula-title { color:#6a1b9a; letter-spacing:1px; text-transform:none; }
    .formula-equation.large { display:flex; justify-content:center; margin:32px 0; background:transparent; box-shadow:none; padding:0; }
    .formula-equation.large .formula-text { font-size:32px; font-weight:bold; color:#4a148c; background:#fff; padding:24px 40px; border-radius:12px; box-shadow:0 4px 16px rgba(0,0,0,.1); font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; letter-spacing:normal; }
    .formula-highlights-complete { display:grid; grid-template-columns:repeat(3,1fr); gap:24px; margin:32px 0; }
    .formula-highlights-complete .formula-highlight { text-align:center; padding:20px; border-radius:12px; background:#fff; border:3px solid; transition:all .3s ease; margin:0; }
    .formula-highlights-complete .formula-highlight.hazard { border-color:#d32f2f; background:#ffebee; }
    .formula-highlights-complete .formula-highlight.vulnerability { border-color:#e65100; background:#fff3e0; }
    .formula-highlights-complete .formula-highlight.capacity { border-color:#1976d2; background:#e3f2fd; }
    .formula-highlights-complete .formula-highlight:hover { transform:translateY(-4px); box-shadow:0 6px 20px rgba(0,0,0,.15); }
    .formula-highlights-complete .highlight-arrow { font-size:28px; margin-bottom:8px; color:inherit; }
    .formula-highlights-complete .highlight-arrow::before { content:"\\25BC"; }
    .highlight-label { font-size:16px; font-weight:bold; color:#333; margin-bottom:8px; }
    .highlight-description { font-size:13px; color:#666; line-height:1.4; }
    .formula-explanation.complete { background:#fff; padding:32px; border-radius:12px; margin-top:32px; }
    .formula-explanation.complete h4 { font-size:22px; color:#6a1b9a; margin-bottom:24px; font-weight:bold; text-align:center; }
    .geometric-comparison { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin:24px 0; }
    .comparison-col { padding:24px; border-radius:12px; border:3px solid; }
    .comparison-col.problem { border-color:#d32f2f; background:#ffebee; }
    .comparison-col.benefit { border-color:#43a047; background:#e8f5e9; }
    .comparison-col .comparison-title { font-size:18px; font-weight:bold; margin-bottom:16px; text-align:center; }
    .comparison-formula { background:#fff; padding:16px; border-radius:8px; text-align:center; font-size:16px; font-weight:600; margin-bottom:16px; font-family:'Courier New',monospace; }
    .comparison-problem, .comparison-benefit { font-size:15px; line-height:1.6; margin-bottom:12px; padding:12px; background:#fff; border-radius:6px; }
    .comparison-example { font-size:14px; line-height:1.5; color:#555; font-style:italic; padding:12px; background:rgba(255,255,255,.6); border-radius:6px; }
    .geometric-insight { background:#e8f5e9; padding:20px; border-radius:10px; border-left:6px solid #43a047; margin-top:24px; font-size:16px; line-height:1.7; color:#333; }
    .tanzania-risk-section { margin:50px 0; }
    .tanzania-risk-section h2 { font-size:28px; font-weight:bold; color:#333; margin-bottom:16px; }
    .risk-score-card { background:#fff; border-radius:20px; box-shadow:0 8px 32px rgba(0,0,0,.1); overflow:hidden; margin:32px 0; }
    .score-main { padding:40px; text-align:center; border-bottom:4px solid; background:#fff3e0; }
    .score-label { font-size:18px; color:#666; margin-bottom:16px; font-weight:600; }
    .score-value { font-size:72px; font-weight:bold; margin:16px 0; line-height:1; }
    .score-classification { display:inline-block; padding:12px 32px; color:#fff; font-size:20px; font-weight:bold; border-radius:8px; margin:16px 0; }
    .score-rank { font-size:16px; color:#666; margin-top:16px; }
    .dimensions-breakdown { padding:40px; background:#fff; }
    .dimensions-breakdown h4 { font-size:20px; color:#333; margin-bottom:24px; font-weight:bold; }
    .dimension-bars { margin-bottom:32px; }
    .dimension-bar { margin:20px 0; }
    .dimension-label { display:flex; align-items:center; gap:12px; font-size:16px; font-weight:600; color:#333; margin-bottom:12px; }
    .dimension-value-bar { background:#e0e0e0; height:40px; border-radius:8px; overflow:hidden; position:relative; }
    .dimension-fill { height:100%; display:flex; align-items:center; justify-content:flex-end; padding-right:16px; transition:width .6s ease; position:relative; }
    .dimension-fill.hazard { background:#ef5350; }
    .dimension-fill.vulnerability { background:#ff7043; }
    .dimension-fill.capacity { background:#42a5f5; }
    .dimension-score { color:#fff; font-size:18px; font-weight:bold; }
    .calculation-display { background:#f5f5f5; padding:24px; border-radius:12px; text-align:center; }
    .calculation-formula { font-size:20px; font-weight:600; color:#333; font-family:'Courier New',monospace; }
    .context-box { background:#e3f2fd; padding:24px; border-radius:12px; border-left:6px solid #1976d2; margin:32px 0; display:flex; gap:16px; align-items:flex-start; }
    .context-text { font-size:16px; line-height:1.7; color:#333; }
    .classification-section { margin:50px 0; }
    .classification-section h2 { font-size:28px; font-weight:bold; color:#333; margin-bottom:16px; }
    .risk-levels-table { background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 16px rgba(0,0,0,.08); }
    .risk-level-row { display:grid; grid-template-columns:80px 200px 1fr auto; align-items:center; gap:20px; padding:20px; border-bottom:2px solid #f0f0f0; border-left:5px solid; transition:all .3s ease; }
    .risk-level-row:hover { background:#f9f9f9; transform:translateX(4px); }
    .risk-level-row.current { background:#fff3e0; border-left-width:8px; }
    .risk-level-row:last-child { border-bottom:none; }
    .level-color { width:60px; height:60px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,.15); }
    .level-info { display:flex; flex-direction:column; gap:4px; }
    .level-name { font-size:18px; font-weight:bold; color:#333; }
    .level-range { font-size:14px; color:#666; font-family:'Courier New',monospace; }
    .level-description { font-size:15px; color:#555; line-height:1.5; }
    .current-indicator { font-size:16px; font-weight:bold; color:#ff9800; padding:8px 16px; background:#fff3e0; border-radius:6px; }
    .comparison-tab { padding:14px 28px; border:3px solid #ddd; border-radius:12px; background:#fff; cursor:pointer; transition:all .3s ease; font:inherit; font-size:16px; font-weight:600; color:#666; }
    .comparison-tab:hover { transform:translateY(-2px); box-shadow:0 4px 12px rgba(0,0,0,.15); }
    .comparison-tab.active { border-color:#1976d2; background:#e3f2fd; color:#1976d2; box-shadow:0 4px 12px rgba(25,118,210,.2); }
    .comparison-content { background:#fff; padding:32px; border-radius:16px; box-shadow:0 4px 16px rgba(0,0,0,.08); animation:slideDown .3s ease; }
    .comparison-bars { margin-bottom:24px; }
    .comparison-bar-row { display:grid; grid-template-columns:220px 1fr; gap:20px; align-items:center; margin:16px 0; }
    .comparison-label { font-size:16px; font-weight:600; color:#333; }
    .comparison-bar-container { background:#e0e0e0; height:40px; border-radius:8px; overflow:hidden; }
    .comparison-bar-fill { height:100%; display:flex; align-items:center; justify-content:flex-end; padding-right:16px; transition:width .6s ease; }
    .comparison-score { color:#fff; font-size:16px; font-weight:bold; }
    .comparison-insight { background:#e8f5e9; padding:20px; border-radius:10px; border-left:6px solid #43a047; font-size:15px; line-height:1.7; color:#333; margin-top:24px; }
    .dimension-comparison-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:24px; margin-bottom:24px; }
    .dimension-comparison-card { background:#fff; border:3px solid #e0e0e0; border-radius:12px; overflow:hidden; transition:all .3s ease; }
    .dimension-comparison-card:hover { transform:translateY(-4px); box-shadow:0 6px 20px rgba(0,0,0,.15); }
    .dimension-card-header { color:#fff; padding:20px; text-align:center; font-size:16px; font-weight:bold; }
    .dimension-card-body { padding:20px; }
    .dimension-score-row { display:flex; justify-content:space-between; align-items:center; padding:12px; margin:8px 0; background:#f9f9f9; border-radius:6px; }
    .dimension-score-row .score-label { font-size:14px; color:#666; margin:0; }
    .dimension-score-row .score-value { font-size:18px; font-weight:bold; }
    .scenario-section { margin:50px 0; background:#f3e5f5; padding:40px; border-radius:20px; border:4px solid #7b1fa2; box-shadow:0 6px 24px rgba(123,31,162,.15); }
    .scenario-section h2 { font-size:28px; font-weight:bold; color:#6a1b9a; margin-bottom:16px; text-align:center; }
    .scenario-tool { background:#fff; padding:32px; border-radius:16px; margin-top:24px; }
    .scenario-controls { margin-bottom:32px; }
    .scenario-slider { margin:24px 0; display:grid; grid-template-columns:250px 1fr auto; gap:16px; align-items:center; }
    .scenario-slider label { display:flex; align-items:center; gap:12px; font-size:16px; font-weight:600; color:#333; }
    .slider-label { flex:1; }
    .slider { -webkit-appearance:none; appearance:none; width:100%; height:12px; border-radius:6px; outline:none; transition:opacity .2s; }
    .slider:hover { opacity:.9; }
    .slider::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:28px; height:28px; border-radius:50%; background:#fff; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.3); border:3px solid; }
    .slider::-moz-range-thumb { width:28px; height:28px; border-radius:50%; background:#fff; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.3); border:3px solid; }
    .slider.hazard { background:#ffcdd2; }
    .slider.hazard::-webkit-slider-thumb { border-color:#d32f2f; } .slider.hazard::-moz-range-thumb { border-color:#d32f2f; }
    .slider.vulnerability { background:#ffe0b2; }
    .slider.vulnerability::-webkit-slider-thumb { border-color:#e65100; } .slider.vulnerability::-moz-range-thumb { border-color:#e65100; }
    .slider.capacity { background:#bbdefb; }
    .slider.capacity::-webkit-slider-thumb { border-color:#1976d2; } .slider.capacity::-moz-range-thumb { border-color:#1976d2; }
    .slider-value { font-size:20px; font-weight:bold; color:#333; min-width:50px; text-align:right; }
    .scenario-result { background:#f3e5f5; padding:32px; border-radius:16px; text-align:center; margin:32px 0; border:3px solid #7b1fa2; }
    .scenario-calculation { display:flex; align-items:center; justify-content:center; gap:16px; margin-bottom:20px; flex-wrap:wrap; }
    .scenario-formula { font-size:22px; font-weight:600; color:#333; font-family:'Courier New',monospace; }
    .scenario-equals { font-size:32px; font-weight:bold; color:#6a1b9a; }
    .scenario-risk-score { font-size:48px; font-weight:bold; padding:20px 40px; border-radius:12px; box-shadow:0 4px 16px rgba(0,0,0,.2); color:#fff; }
    .scenario-classification { font-size:24px; font-weight:bold; margin:12px 0; }
    .scenario-description { font-size:16px; color:#666; }
    .scenario-examples { margin-top:32px; }
    .scenario-examples h4 { font-size:18px; color:#6a1b9a; margin-bottom:16px; font-weight:bold; }
    .scenario-buttons { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; }
    .scenario-preset-btn { padding:16px 20px; border:3px solid #7b1fa2; border-radius:10px; background:#fff; cursor:pointer; transition:all .3s ease; font:inherit; font-size:15px; font-weight:600; color:#6a1b9a; display:flex; flex-direction:column; align-items:center; gap:8px; }
    .scenario-preset-btn:hover { transform:translateY(-2px); box-shadow:0 4px 12px rgba(123,31,162,.2); background:#f3e5f5; }
    .scenario-preset-btn.reset { border-color:#9e9e9e; color:#616161; }
    .scenario-preset-btn.reset:hover { background:#f5f5f5; }
    .preset-hint { font-size:12px; color:#999; font-weight:normal; }
    .risk-manageable { background:#e8f5e9; border:4px solid #43a047; box-shadow:0 8px 24px rgba(67,160,71,.2); padding:40px; display:block; }
    .risk-manageable .teaching-content h3 { font-size:28px; color:#2e7d32; margin-bottom:32px; font-weight:bold; text-align:center; }
    .manageable-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:24px; margin:32px 0; }
    .manageable-item { background:#fff; padding:24px; border-radius:12px; border:3px solid #81c784; transition:all .3s ease; }
    .manageable-item:hover { transform:translateY(-4px); box-shadow:0 6px 20px rgba(67,160,71,.2); border-color:#43a047; }
    .manageable-text strong { display:block; font-size:18px; color:#2e7d32; margin-bottom:8px; text-align:center; }
    .manageable-text p { font-size:14px; line-height:1.6; color:#555; text-align:center; margin:0; }
    .action-pathways { background:#fff; padding:28px; border-radius:12px; margin:32px 0; }
    .action-pathways h4 { font-size:20px; color:#2e7d32; margin-bottom:20px; font-weight:bold; text-align:center; }
    .pathway-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:20px; }
    .pathway { background:#f1f8e9; padding:20px; border-radius:10px; border:2px solid #aed581; text-align:center; transition:all .3s ease; }
    .pathway:hover { transform:translateY(-4px); box-shadow:0 4px 16px rgba(67,160,71,.15); border-color:#7cb342; }
    .pathway strong { display:block; font-size:16px; color:#2e7d32; margin-bottom:8px; }
    .pathway p { font-size:13px; line-height:1.5; color:#666; margin:0; }
    .manageable-conclusion { background:#fff9c4; padding:24px; border-radius:12px; border-left:6px solid #fbc02d; font-size:16px; line-height:1.7; color:#333; margin-top:24px; }
    .risk-summary { background:#e3f2fd; border:4px solid #1976d2; border-radius:16px; padding:40px; margin:50px 0; box-shadow:0 6px 20px rgba(25,118,210,.15); }
    .risk-summary h3 { font-size:26px; color:#0d47a1; margin-bottom:24px; font-weight:bold; text-align:center; }
    .risk-summary .summary-point:hover { background:#e3f2fd; }
    .module-completion { background:#fff3e0; padding:32px; border-radius:16px; border:4px solid #ff9800; text-align:center; }
    .module-completion h3 { font-size:28px; color:#e65100; margin-bottom:20px; font-weight:bold; }
    .completion-message { font-size:17px; line-height:1.7; color:#333; margin-bottom:24px; }
    .next-module-preview { background:#fff; padding:24px; border-radius:12px; border-left:6px solid #ff9800; text-align:left; }
    .next-module-preview h4 { color:#e65100; font-size:20px; margin-bottom:12px; font-weight:bold; }
    .next-module-preview p { line-height:1.7; color:#333; font-size:15px; margin:0; }

    /* ===== QUIZ ===== */
    .quiz-container { max-width:900px; margin:0 auto; padding:20px; animation:fadeIn .5s ease; }
    .quiz-header { text-align:center; margin-bottom:40px; }
    .quiz-header h2 { color:#1976d2; font-size:32px; font-weight:bold; margin-bottom:16px; }
    .quiz-instruction { font-size:18px; color:#555; margin:0; padding:12px 20px; border-radius:8px; background:#f5f5f5; }
    .quiz-content { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:40px; box-shadow:0 4px 16px rgba(0,0,0,.1); margin-bottom:24px; }
    .quiz-question { margin-bottom:32px; }
    .quiz-question p { font-size:22px; font-weight:600; color:#333; line-height:1.5; margin:0; }
    .quiz-options { display:flex; flex-direction:column; gap:16px; }
    .quiz-option { display:flex; align-items:center; gap:16px; padding:20px 24px; background:#fafafa; border:3px solid transparent; border-radius:12px; cursor:pointer; transition:all .3s ease; font:inherit; font-size:16px; text-align:left; position:relative; width:100%; }
    .quiz-option:hover:not(:disabled) { background:#f0f7ff; border-color:#90caf9; transform:translateX(4px); }
    .quiz-option.selected { background:#e3f2fd; border-color:#1976d2; font-weight:600; }
    .quiz-option.correct { background:#e8f5e9; border-color:#43a047; font-weight:600; }
    .quiz-option.incorrect { background:#ffebee; border-color:#d32f2f; font-weight:600; }
    .quiz-option:disabled { cursor:default; }
    .option-letter { display:flex; align-items:center; justify-content:center; min-width:40px; height:40px; background:#1976d2; color:#fff; border-radius:50%; font-weight:bold; font-size:18px; flex-shrink:0; }
    .quiz-option.selected .option-letter { background:#1565c0; }
    .quiz-option.correct .option-letter { background:#43a047; }
    .quiz-option.incorrect .option-letter { background:#d32f2f; }
    .option-text { flex:1; color:#333; line-height:1.5; }
    .option-indicator { font-size:24px; font-weight:bold; margin-left:auto; }
    .quiz-option.correct .option-indicator { color:#43a047; }
    .quiz-option.correct .option-indicator::before { content:"\\2713"; }
    .quiz-option.incorrect .option-indicator { color:#d32f2f; }
    .quiz-option.incorrect .option-indicator::before { content:"\\2717"; }
    .quiz-explanation { margin-top:32px; padding:24px; border-radius:12px; border-left:5px solid; animation:slideDown .4s ease; }
    .quiz-explanation.correct-box { background:#e8f5e9; border-color:#43a047; }
    .quiz-explanation.incorrect-box { background:#ffebee; border-color:#d32f2f; }
    .explanation-title { font-size:20px; font-weight:bold; margin-bottom:12px; }
    .quiz-explanation.correct-box .explanation-title { color:#2e7d32; }
    .quiz-explanation.incorrect-box .explanation-title { color:#c62828; }
    .explanation-text { font-size:16px; line-height:1.6; color:#333; }
    .quiz-footer { text-align:center; }
    .quiz-submit-btn, .quiz-continue-btn { padding:16px 48px; font:inherit; font-size:18px; font-weight:bold; border:none; border-radius:12px; cursor:pointer; transition:all .3s ease; box-shadow:0 4px 12px rgba(0,0,0,.15); }
    .quiz-submit-btn { background:#1976d2; color:#fff; }
    .quiz-submit-btn:hover:not(:disabled) { background:#1565c0; transform:translateY(-2px); box-shadow:0 6px 16px rgba(0,0,0,.2); }
    .quiz-submit-btn:disabled { background:#bdbdbd; cursor:not-allowed; box-shadow:none; }
    .quiz-continue-btn.success { background:#43a047; color:#fff; }
    .quiz-continue-btn.success:hover { background:#388e3c; transform:translateY(-2px); box-shadow:0 6px 16px rgba(67,160,71,.3); }
    .quiz-continue-btn.retry { background:#ff9800; color:#fff; }
    .quiz-continue-btn.retry:hover { background:#f57c00; transform:translateY(-2px); box-shadow:0 6px 16px rgba(255,152,0,.3); }

    /* ===== RESPONSIVE ===== */
    @media (max-width:768px) {
      .section-title, .section-header h1 { font-size:28px; }
      .progress-tracker { flex-wrap:wrap; gap:20px; }
      .progress-step { flex-basis:calc(33.333% - 14px); }
      .step-circle { width:40px; height:40px; font-size:16px; }
      .step-title { font-size:14px; } .step-subtitle { font-size:12px; }
      .section-content { padding:24px; }
      .gcourse-footer { flex-wrap:wrap; }
      .nav-button { font-size:14px; padding:12px 20px; }
      .teaching-box { flex-direction:column; gap:16px; padding:20px; }
      .category-selector, .overlay-controls, .comparison-controls, .phases-selector { flex-direction:column; }
      .category-button, .overlay-step-button, .comparison-button, .phase-button { min-width:100%; width:100%; }
      .hazard-grid, .districts-grid, .details-grid, .exposure-comparison, .factors-grid, .indicators-grid, .groups-grid,
      .component-selector, .capacity-components-grid, .emphasis-grid, .explanation-grid, .manageable-grid, .pathway-grid,
      .geometric-comparison, .formula-highlights-complete, .dimension-comparison-grid, .scenario-buttons { grid-template-columns:1fr; }
      .comparison-display, .scenario-comparison { flex-direction:column; grid-template-columns:1fr; gap:16px; }
      .district-column, .scenario-column { max-width:100%; }
      .comparison-arrow, .scenario-divider { transform:rotate(90deg); font-size:32px; }
      .challenge-formula { flex-direction:column; }
      .formula-part, .formula-result { width:100%; text-align:center; }
      .formula-text { font-size:24px; } .formula-text sup { font-size:16px; }
      .formula-equation.large .formula-text { font-size:24px; padding:20px 24px; }
      .score-value { font-size:56px; }
      .comparison-bar-row, .scenario-slider, .risk-level-row { grid-template-columns:1fr; gap:12px; }
      .level-color { width:100%; height:40px; }
      .scenario-section, .risk-manageable, .risk-summary { padding:24px; }
      .quiz-header h2 { font-size:24px; }
      .quiz-content { padding:24px 20px; }
      .quiz-submit-btn, .quiz-continue-btn { width:100%; padding:14px 32px; font-size:16px; }
    }
  `],
  template: `
    <div class="page">
      <a class="backlink" routerLink="/education">&#8592; {{ t('back_to_education') }}</a>

      <div class="gcourse-landing">
        <!-- Header -->
        <header class="gcourse-header">
          <div class="ui-eyebrow">{{ t('course_eyebrow') }}</div>
          <h1 class="ui-h1">{{ t('course_title') }}</h1>
        </header>

        <!-- Progress Bar -->
        <div class="progress-container">
          <div class="progress-tracker">
            @for (section of SECTIONS; track section.id) {
              <div class="progress-step {{ stepState(section.id) }}">
                <div class="step-circle">@if (!isCompleted(section.id)) { {{ section.id }} } @else { &#10003; }</div>
                <div class="step-label">
                  <div class="step-title">{{ tx(section.title) }}</div>
                  <div class="step-subtitle">{{ tx(section.subtitle) }}</div>
                </div>
              </div>
            }
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar-fill" [style.width.%]="progressPct()"></div>
          </div>
          <div class="progress-text">{{ t('section_word') }} {{ currentSection() }} {{ t('of_six') }} &bull; {{ completedSections().length }} {{ t('completed_word') }}</div>
        </div>

        <!-- Main Content -->
        <main class="gcourse-main">
          @if (!showQuiz()) {
            <div class="section-content">
              @switch (currentSection()) {
                @case (1) { <ng-container [ngTemplateOutlet]="sec1"></ng-container> }
                @case (2) { <ng-container [ngTemplateOutlet]="sec2"></ng-container> }
                @case (3) { <ng-container [ngTemplateOutlet]="sec3"></ng-container> }
                @case (4) { <ng-container [ngTemplateOutlet]="sec4"></ng-container> }
                @case (5) { <ng-container [ngTemplateOutlet]="sec5"></ng-container> }
                @case (6) { <ng-container [ngTemplateOutlet]="sec6"></ng-container> }
              }
            </div>
          } @else {
            <ng-container [ngTemplateOutlet]="quiz"></ng-container>
          }
        </main>

        <!-- Navigation -->
        <footer class="gcourse-footer">
          <button class="nav-button prev" (click)="previous()" [disabled]="currentSection() === 1">{{ t('previous') }}</button>

          @if (!showQuiz() && !isCompleted(currentSection())) {
            <button class="nav-button quiz" (click)="takeQuiz()">{{ t('take_quiz') }}</button>
          }
          @if (!showQuiz() && isCompleted(currentSection()) && currentSection() < 6) {
            <button class="nav-button next" (click)="goNext()">{{ t('next') }}</button>
          }
          @if (completedSections().length === 6) {
            <button class="nav-button complete" (click)="onCourseComplete()">{{ t('continue_to_risk_module') }}</button>
          }
        </footer>

        <!-- Important Notice -->
        <div class="important-notice">
          <div class="notice-content">
            <strong>{{ t('notice_strong') }}</strong> {{ t('notice_rest1') }}
            <br />
            {{ t('notice_rest2') }}
          </div>
        </div>
      </div>
    </div>

    <!-- ============ QUIZ TEMPLATE ============ -->
    <ng-template #quiz>
      @if (currentQuiz(); as q) {
        <div class="quiz-container">
          <div class="quiz-header">
            <h2>{{ t('section_word') }} {{ currentSection() }} {{ t('quiz_word') }}: {{ tx(q.section) }}</h2>
            <p class="quiz-instruction">
              @if (!showResult()) { {{ t('quiz_select_submit') }} }
              @else if (quizIsCorrect()) { {{ t('quiz_correct_proceed') }} }
              @else { {{ t('quiz_incorrect_review') }} }
            </p>
          </div>
          <div class="quiz-content">
            <div class="quiz-question"><p>{{ tx(q.question) }}</p></div>
            <div class="quiz-options">
              @for (option of q.options; track $index) {
                <button class="quiz-option {{ optionClass($index) }}" (click)="selectAnswer($index)" [disabled]="showResult()">
                  <span class="option-letter">{{ letter($index) }}</span>
                  <span class="option-text">{{ tx(option) }}</span>
                  @if (showResult() && $index === q.correct) { <span class="option-indicator"></span> }
                  @if (showResult() && selectedAnswer() === $index && $index !== q.correct) { <span class="option-indicator"></span> }
                </button>
              }
            </div>
            @if (showExplanation()) {
              <div class="quiz-explanation {{ quizIsCorrect() ? 'correct-box' : 'incorrect-box' }}">
                <div class="explanation-title">{{ quizIsCorrect() ? t('correct_word') : t('incorrect_word') }}</div>
                <div class="explanation-text">{{ tx(q.explanation) }}</div>
              </div>
            }
          </div>
          <div class="quiz-footer">
            @if (!showResult()) {
              <button class="quiz-submit-btn" (click)="submitQuiz()" [disabled]="selectedAnswer() === null">{{ t('submit_answer') }}</button>
            } @else {
              <button class="quiz-continue-btn {{ quizIsCorrect() ? 'success' : 'retry' }}" (click)="continueQuiz()">
                {{ quizIsCorrect() ? t('continue_next_section') : t('review_section_retry') }}
              </button>
            }
          </div>
        </div>
      }
    </ng-template>
    <!-- ============ SECTION 1: HAZARD ============ -->
    <ng-template #sec1>
      <div class="section1-hazard">
        <div class="section-header">
          <div class="section-number">{{ t('s1_number') }}</div>
          <h2 class="section-title">{{ t('s1_title') }}</h2>
          <p class="section-intro">{{ t('s1_intro') }}</p>
        </div>

        <div class="inform-definition">
          <div class="definition-header"><span class="definition-label">{{ t('inform_definition_label') }}</span></div>
          <div class="definition-content">
            <h3>{{ t('s1_def_h') }}</h3>
            <p><strong>{{ t('s1_def_p1') }}</strong></p>
            <p>{{ t('s1_def_p2') }}</p>
          </div>
        </div>

        <div class="teaching-box critical">
          <div class="teaching-content">
            <h4>{{ t('s1_critical_lesson') }}</h4>
            <div class="teaching-divider"></div>
            <h3>{{ t('s1_hazard_and_disaster') }}</h3>
            <p class="teaching-emphasis">{{ t('s1_becomes_when') }}</p>
            <ul class="teaching-list">
              <li><strong>{{ t('s1_li1_b') }}</strong> {{ t('s1_li1_r') }}</li>
              <li><strong>{{ t('s1_li2_b') }}</strong> {{ t('s1_li2_r') }}</li>
              <li><strong>{{ t('s1_li3_b') }}</strong> {{ t('s1_li3_r') }}</li>
            </ul>
            <div class="teaching-example">
              <strong>{{ t('example_word') }}</strong> {{ t('s1_example_a') }} <strong>{{ t('s1_example_b') }}</strong>.
              {{ t('s1_example_c') }}
            </div>
          </div>
        </div>

        <div class="tanzania-hazards">
          <h3 class="subsection-title">{{ t('s1_hazards_in_tz') }}</h3>
          <p class="subsection-intro">{{ t('s1_hazards_in_tz_intro') }}</p>

          <div class="category-selector">
            @for (key of s1CategoryKeys; track key) {
              <button class="category-button" [class.active]="s1Category() === key"
                (click)="s1SelectCategory($any(key))"
                [style.borderColor]="s1Category() === key ? HAZARD_CATEGORIES[key].color : '#ddd'"
                [style.backgroundColor]="s1Category() === key ? HAZARD_CATEGORIES[key].color : 'white'"
                [style.color]="s1Category() === key ? 'white' : '#333'">
                <span class="category-title">{{ tx(HAZARD_CATEGORIES[key].title) }}</span>
                <span class="category-count">({{ HAZARD_CATEGORIES[key].hazards.length }})</span>
              </button>
            }
          </div>

          <div class="hazard-grid">
            @for (hazard of s1CurrentCategory().hazards; track hazard.id) {
              <div class="hazard-card" [class.selected]="s1SelectedHazard()?.id === hazard.id"
                (click)="s1SelectedHazard.set(hazard)"
                [style.borderColor]="s1SelectedHazard()?.id === hazard.id ? s1CurrentCategory().color : '#e0e0e0'">
                <div class="hazard-info">
                  <h4 class="hazard-name">{{ tx(hazard.name) }}</h4>
                  <div class="hazard-frequency">
                    <span class="frequency-label">{{ t('frequency_label') }}</span>
                    <span class="frequency-value">{{ tx(hazard.frequency) }}</span>
                  </div>
                </div>
              </div>
            }
          </div>

          @if (s1SelectedHazard(); as sel) {
            <div class="hazard-details" [style.borderLeftColor]="s1CurrentCategory().color">
              <h4>{{ tx(sel.name) }}</h4>
              <div class="detail-grid">
                <div class="detail-item"><span class="detail-label">{{ t('category_label') }}</span><span class="detail-value">{{ tx(s1CurrentCategory().title) }}</span></div>
                <div class="detail-item"><span class="detail-label">{{ t('typical_frequency_label') }}</span><span class="detail-value">{{ tx(sel.frequency) }}</span></div>
                <div class="detail-item"><span class="detail-label">{{ t('status_label') }}</span><span class="detail-value">{{ tx(s1HazardStatus(sel.id)) }}</span></div>
              </div>
            </div>
          }
        </div>

        <div class="no-impact-notice">
          <div class="notice-text">
            <strong>{{ t('important_word') }}</strong> {{ t('s1_no_impact_a') }} <strong>{{ t('s1_no_impact_b') }}</strong>.
            <br />{{ t('s1_no_impact_c') }}
            <br /><span class="notice-emphasis-inline">{{ t('s1_no_impact_d') }}</span>
          </div>
        </div>

        <div class="historical-timeline">
          <h3 class="subsection-title">{{ t('s1_timeline_h') }}</h3>
          <p class="subsection-intro">{{ t('s1_timeline_intro') }}</p>
          <div class="timeline-chart">
            <div class="timeline-year-labels">
              @for (year of TIMELINE_YEARS; track year) { <div class="year-label">{{ year }}</div> }
            </div>
            <div class="timeline-events">
              <div class="event-row floods">
                <span class="event-type">{{ t('floods_word') }}</span>
                <div class="event-markers">
                  <div class="event-marker" style="left:10%"></div>
                  <div class="event-marker" style="left:30%"></div>
                  <div class="event-marker" style="left:50%"></div>
                  <div class="event-marker" style="left:70%"></div>
                  <div class="event-marker" style="left:90%"></div>
                </div>
              </div>
              <div class="event-row drought">
                <span class="event-type">{{ t('drought_word') }}</span>
                <div class="event-markers">
                  <div class="event-marker" style="left:25%;width:30%"></div>
                  <div class="event-marker" style="left:65%;width:25%"></div>
                </div>
              </div>
              <div class="event-row epidemics">
                <span class="event-type">{{ t('epidemics_word') }}</span>
                <div class="event-markers">
                  <div class="event-marker" style="left:15%"></div>
                  <div class="event-marker" style="left:55%;width:35%"></div>
                </div>
              </div>
              <div class="event-row cyclones">
                <span class="event-type">{{ t('cyclones_word') }}</span>
                <div class="event-markers">
                  <div class="event-marker" style="left:40%"></div>
                  <div class="event-marker" style="left:85%"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="timeline-note">
            <strong>{{ t('note_word') }}</strong> {{ t('s1_timeline_note') }}
          </div>
        </div>

        <div class="section-summary purple">
          <h4>{{ t('s1_summary_h') }}</h4>
          <ul>
            <li>{{ t('s1_sum_li1') }}</li>
            <li>{{ t('s1_sum_li2') }}</li>
            <li><strong>{{ t('s1_sum_li3') }}</strong></li>
            <li>{{ t('s1_sum_li4') }}</li>
          </ul>
          <div class="next-preview"><strong>{{ t('next_section_label') }}</strong> {{ t('s1_next_preview') }}</div>
        </div>
      </div>
    </ng-template>

    <!-- ============ SECTION 2: EXPOSURE ============ -->
    <ng-template #sec2>
      <div class="section2-exposure">
        <div class="section-header">
          <h1>{{ t('s2_title') }}</h1>
          <p class="section-subtitle">{{ t('s2_subtitle') }}</p>
        </div>

        <div class="definition-box exposure-definition">
          <div class="definition-content">
            <h3>{{ t('s2_def_h') }}</h3>
            <p class="inform-definition-p"><strong>{{ t('inform_definition_prefix') }}</strong> {{ t('s2_def_p1') }}</p>
            <p class="definition-explanation">{{ t('s2_def_p2a') }} <strong>{{ t('s2_def_p2b') }}</strong></p>
          </div>
        </div>

        <div class="concept-section">
          <h2>{{ t('s2_overlay_h') }}</h2>
          <p class="concept-intro">{{ t('s2_overlay_intro') }}</p>
          <div class="overlay-visualization">
            <div class="overlay-controls">
              @for (step of OVERLAY_STEPS; track step.id) {
                <button class="overlay-step-button" [class.active]="s2OverlayStep() === step.id"
                  (click)="s2OverlayStep.set(step.id)"
                  [style.borderColor]="s2OverlayStep() === step.id ? step.color : '#ddd'"
                  [style.backgroundColor]="s2OverlayStep() === step.id ? step.color : 'white'"
                  [style.color]="s2OverlayStep() === step.id ? 'white' : '#333'">
                  <span class="step-title-s">{{ tx(step.title) }}</span>
                </button>
              }
            </div>
            <div class="overlay-display">
              <div class="overlay-layer hazard-layer" [class.visible]="s2OverlayStep() >= 0">
                <div class="layer-label">{{ t('s2_layer_hazard') }}</div><div class="layer-pattern hazard-pattern"></div>
              </div>
              <div class="overlay-layer population-layer" [class.visible]="s2OverlayStep() >= 1">
                <div class="layer-label">{{ t('s2_layer_population') }}</div><div class="layer-pattern population-pattern"></div>
              </div>
              <div class="overlay-layer exposure-layer" [class.visible]="s2OverlayStep() >= 2">
                <div class="layer-label">{{ t('s2_layer_exposure') }}</div><div class="layer-pattern exposure-pattern"></div>
              </div>
            </div>
            <div class="overlay-explanation">
              <p>{{ tx(OVERLAY_STEPS[s2OverlayStep()].description) }}</p>
              @if (s2OverlayStep() === 2) { <div class="overlay-formula"><strong>{{ t('s2_overlay_formula') }}</strong></div> }
            </div>
          </div>
        </div>

        <div class="teaching-box exposure-types">
          <div class="teaching-content">
            <h3>{{ t('s2_two_ways_h') }}</h3>
            <div class="exposure-comparison">
              <div class="exposure-type">
                <div class="exposure-type-header"><h4>{{ t('s2_absolute_h') }}</h4></div>
                <p><strong>{{ t('definition_prefix') }}</strong> {{ t('s2_absolute_def') }}</p>
                <p class="example-text"><em>{{ t('example_em') }}</em> {{ t('s2_absolute_ex') }}</p>
                <p class="why-important"><strong>{{ t('why_matters_prefix') }}</strong> {{ t('s2_absolute_why') }}</p>
              </div>
              <div class="divider-vertical"></div>
              <div class="exposure-type">
                <div class="exposure-type-header"><h4>{{ t('s2_relative_h') }}</h4></div>
                <p><strong>{{ t('definition_prefix') }}</strong> {{ t('s2_relative_def') }}</p>
                <p class="example-text"><em>{{ t('example_em') }}</em> {{ t('s2_relative_ex') }}</p>
                <p class="why-important"><strong>{{ t('why_matters_prefix') }}</strong> {{ t('s2_relative_why') }}</p>
              </div>
            </div>
            <div class="inform-note">
              <strong>{{ t('s2_both_metrics_b') }}</strong> {{ t('s2_both_metrics_r') }}
            </div>
          </div>
        </div>

        <div class="exposure-data-section">
          <h2>{{ t('s2_data_h') }}</h2>
          <p class="data-intro">{{ t('s2_data_intro') }}</p>
          <div class="districts-grid">
            @for (district of EXPOSURE_DATA; track district.id) {
              <div class="district-card" [class.selected]="s2SelectedDistrict()?.id === district.id" (click)="s2SelectedDistrict.set(district)">
                <div class="district-header">
                  <h4>{{ district.name }}</h4>
                  <span class="hazard-badge" [style.backgroundColor]="hazardBadgeColor(district.hazardType)">{{ tx(district.hazardTypeLabel) }}</span>
                </div>
                <div class="district-metric">
                  <div class="metric-value">{{ fmtNum(district.population) }}</div>
                  <div class="metric-label">{{ t('s2_people_in_zone') }}</div>
                </div>
                <div class="district-percentage">
                  <div class="percentage-bar"><div class="percentage-fill" [style.width.%]="district.relativeExposure"></div></div>
                  <div class="percentage-text">{{ district.relativeExposure }}% {{ t('s2_exposed_word') }}</div>
                </div>
              </div>
            }
          </div>
          @if (s2SelectedDistrict(); as sel) {
            <div class="district-details">
              <h3>{{ sel.name }} - {{ t('s2_detailed_exposure') }}</h3>
              <div class="details-grid">
                <div class="detail-item"><div class="detail-label">{{ t('s2_zone_area') }}</div><div class="detail-value">{{ fmtNum(sel.hazardZone) }} km&sup2;</div></div>
                <div class="detail-item"><div class="detail-label">{{ t('s2_pop_in_zone_abs') }}</div><div class="detail-value">{{ fmtNum(sel.population) }}</div></div>
                <div class="detail-item"><div class="detail-label">{{ t('s2_total_district_pop') }}</div><div class="detail-value">{{ fmtNum(sel.totalPopulation) }}</div></div>
                <div class="detail-item"><div class="detail-label">{{ t('s2_exposure_rate_rel') }}</div><div class="detail-value">{{ sel.relativeExposure }}%</div></div>
              </div>
              <div class="detail-description"><strong>{{ t('s2_hazard_context_prefix') }}</strong> {{ tx(sel.description) }}</div>
            </div>
          }
        </div>

        <div class="teaching-box tanzania-challenge">
          <div class="teaching-content">
            <h3>{{ t('s2_challenge_h') }}</h3>
            <div class="challenge-formula">
              <div class="formula-part">{{ t('s2_formula_part1') }}</div>
              <div class="formula-operator">+</div>
              <div class="formula-part">{{ t('s2_formula_part2') }}</div>
              <div class="formula-operator">=</div>
              <div class="formula-result">{{ t('s2_formula_result') }}</div>
            </div>
            <div class="challenge-example">
              <strong>{{ t('s2_challenge_ex_h') }}</strong>
              <ul>
                <li>{{ t('s2_challenge_li1') }}</li>
                <li>{{ t('s2_challenge_li2') }}</li>
                <li>{{ t('s2_challenge_li3') }}</li>
              </ul>
            </div>
            <p class="challenge-note"><strong>{{ t('key_insight_prefix') }}</strong> {{ t('s2_challenge_note') }}</p>
          </div>
        </div>

        <div class="notice-box exposure-notice">
          <div class="notice-content">
            <h4>{{ t('s2_notice_h') }}</h4>
            <p>{{ t('s2_notice_p') }}</p>
            <ul class="notice-list">
              <li><strong>{{ t('s2_notice_li1_b') }}</strong> {{ t('s2_notice_li1_r') }}</li>
              <li><strong>{{ t('s2_notice_li2_b') }}</strong> {{ t('s2_notice_li2_r') }}</li>
              <li><strong>{{ t('s2_notice_li3_b') }}</strong> {{ t('s2_notice_li3_r') }}</li>
            </ul>
            <p class="notice-emphasis-box"><strong>{{ t('s2_notice_emph_b') }}</strong> {{ t('s2_notice_emph_r') }}</p>
          </div>
        </div>

        <div class="summary-purple">
          <h3>{{ t('s2_summary_h') }}</h3>
          <div class="summary-points">
            <div class="summary-point"><span class="check-icon"></span><span class="point-text"><strong>{{ t('s2_sum_li1_b') }}</strong> {{ t('s2_sum_li1_r') }}</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">{{ t('s2_sum_li2_a') }} <strong>{{ t('s2_sum_li2_b1') }}</strong> {{ t('s2_sum_li2_m') }} <strong>{{ t('s2_sum_li2_b2') }}</strong> {{ t('s2_sum_li2_end') }}</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">{{ t('s2_sum_li3_a') }} <strong>{{ t('s2_sum_li3_b') }}</strong> {{ t('s2_sum_li3_r') }}</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text"><strong>{{ t('s2_sum_li4_b') }}</strong> {{ t('s2_sum_li4_r') }}</span></div>
          </div>
          <div class="next-section-preview">
            <h4>{{ t('s2_next_h') }}</h4>
            <p>{{ t('s2_next_p1') }} <em>{{ t('s2_next_em1') }}</em> {{ t('s2_next_p2') }} <em>{{ t('s2_next_em2') }}</em>. {{ t('s2_next_p3') }} <strong>{{ t('s2_next_b') }}</strong> {{ t('s2_next_p4') }}</p>
          </div>
        </div>
      </div>
    </ng-template>
    <!-- ============ SECTION 3: SENSITIVITY ============ -->
    <ng-template #sec3>
      <div class="section3-sensitivity">
        <div class="section-header">
          <h1>{{ t('s3_title') }}</h1>
          <p class="section-subtitle">{{ t('s3_subtitle') }}</p>
        </div>

        <div class="definition-box sensitivity-definition">
          <div class="definition-content">
            <h3>{{ t('s3_def_h') }}</h3>
            <p class="inform-definition-p"><strong>{{ t('scientific_definition_prefix') }}</strong> {{ t('s3_def_p1') }}</p>
            <p class="definition-explanation">{{ t('s3_def_p2a') }} <strong>{{ t('s3_def_p2b') }}</strong> {{ t('s3_def_p2c') }} <strong>{{ t('s3_def_p2d') }}</strong>, {{ t('s3_def_p2e') }} <strong>{{ t('s3_def_p2f') }}</strong>. {{ t('s3_def_p2g') }}</p>
            <div class="inform-note-small"><strong>{{ t('inform_note_prefix') }}</strong> {{ t('s3_inform_note') }}</div>
          </div>
        </div>

        <div class="comparison-section">
          <h2>{{ t('s3_compare_h') }}</h2>
          <p class="comparison-intro">{{ t('s3_compare_intro_a') }} <strong>{{ t('s3_compare_intro_b') }}</strong> {{ t('s3_compare_intro_c') }} <strong>{{ t('s3_compare_intro_d') }}</strong></p>
          <div class="comparison-controls">
            <button class="comparison-button" [class.active]="s3Selected() === 'districtA'" (click)="s3Selected.set('districtA')"
              [style.borderColor]="s3Selected() === 'districtA' ? '#D32F2F' : '#ddd'" [style.backgroundColor]="s3Selected() === 'districtA' ? '#FFEBEE' : 'white'">{{ t('s3_btn_districtA') }}</button>
            <button class="comparison-button" [class.active]="s3Selected() === 'both'" (click)="s3Selected.set('both')"
              [style.borderColor]="s3Selected() === 'both' ? '#FF9800' : '#ddd'" [style.backgroundColor]="s3Selected() === 'both' ? '#FFF3E0' : 'white'">{{ t('compare_both') }}</button>
            <button class="comparison-button" [class.active]="s3Selected() === 'districtB'" (click)="s3Selected.set('districtB')"
              [style.borderColor]="s3Selected() === 'districtB' ? '#43A047' : '#ddd'" [style.backgroundColor]="s3Selected() === 'districtB' ? '#E8F5E9' : 'white'">{{ t('s3_btn_districtB') }}</button>
          </div>
          <div class="comparison-display {{ s3Selected() === 'both' ? 'side-by-side' : 'single' }}">
            @if (s3Selected() === 'districtA' || s3Selected() === 'both') {
              <div class="district-column" style="border-color:#D32F2F">
                <div class="district-title" style="background-color:#D32F2F">{{ tx(CASE_STUDY.districtA.name) }}</div>
                <div class="hazard-same"><strong>{{ t('s3_same_flood_prefix') }}</strong> {{ tx(CASE_STUDY.districtA.flood) }}</div>
                <div class="factors-list">
                  @for (f of s3FactorList(CASE_STUDY.districtA); track f.type.en) {
                    <div class="factor-item high"><div class="factor-content"><strong>{{ tx(f.type) }}</strong><p>{{ tx(f.details) }}</p></div></div>
                  }
                </div>
                <div class="outcome-box" [style.backgroundColor]="CASE_STUDY.districtA.outcomeColor">
                  <div class="outcome-label">{{ tx(CASE_STUDY.districtA.outcome) }}</div>
                  <div class="outcome-type">({{ tx(CASE_STUDY.districtA.outcomeType) }})</div>
                  <p class="outcome-details">{{ tx(CASE_STUDY.districtA.outcomeDetails) }}</p>
                </div>
              </div>
            }
            @if (s3Selected() === 'both') { <div class="comparison-arrow">&#8594;</div> }
            @if (s3Selected() === 'districtB' || s3Selected() === 'both') {
              <div class="district-column" style="border-color:#43A047">
                <div class="district-title" style="background-color:#43A047">{{ tx(CASE_STUDY.districtB.name) }}</div>
                <div class="hazard-same"><strong>{{ t('s3_same_flood_prefix') }}</strong> {{ tx(CASE_STUDY.districtB.flood) }}</div>
                <div class="factors-list">
                  @for (f of s3FactorList(CASE_STUDY.districtB); track f.type.en) {
                    <div class="factor-item low"><div class="factor-content"><strong>{{ tx(f.type) }}</strong><p>{{ tx(f.details) }}</p></div></div>
                  }
                </div>
                <div class="outcome-box" [style.backgroundColor]="CASE_STUDY.districtB.outcomeColor">
                  <div class="outcome-label">{{ tx(CASE_STUDY.districtB.outcome) }}</div>
                  <div class="outcome-type">({{ tx(CASE_STUDY.districtB.outcomeType) }})</div>
                  <p class="outcome-details">{{ tx(CASE_STUDY.districtB.outcomeDetails) }}</p>
                </div>
              </div>
            }
          </div>
        </div>

        <div class="factors-section">
          <h2>{{ t('s3_factors_h') }}</h2>
          <p class="factors-intro">{{ t('s3_factors_intro') }}</p>
          <div class="factors-grid">
            @for (factor of SENSITIVITY_FACTORS; track factor.id) {
              <div class="sensitivity-factor-card" [class.selected]="s3Factor()?.id === factor.id" (click)="s3ToggleFactor(factor)"
                [style.borderColor]="s3Factor()?.id === factor.id ? factor.color : '#E0E0E0'">
                <div class="factor-header" [style.backgroundColor]="factor.color"><h4>{{ tx(factor.name) }}</h4></div>
                <div class="factor-body">
                  <p class="factor-description">{{ tx(factor.description) }}</p>
                  <div class="indicators-list">
                    @for (ind of factor.indicators; track ind.label.en) {
                      <div class="indicator-item risk-{{ ind.risk }}"><div class="indicator-label">{{ tx(ind.label) }}</div><div class="indicator-value">{{ ind.value }}</div></div>
                    }
                  </div>
                  <div class="tanzania-note"><strong>{{ t('tanzania_prefix') }}</strong> {{ tx(factor.tanzaniaNote) }}</div>
                </div>
              </div>
            }
          </div>
        </div>

        <div class="teaching-box disasters-not-natural">
          <div class="teaching-content">
            <h3>{{ t('s3_insight_h') }}</h3>
            <div class="insight-explanation">
              <p class="insight-emphasis"><strong>{{ t('s3_insight_emph_b') }}</strong> {{ t('s3_insight_emph_r') }}</p>
              <p class="insight-main">{{ t('s3_insight_main_a') }} <strong>{{ t('s3_insight_main_b') }}</strong> {{ t('s3_insight_main_c') }} <strong>{{ t('s3_insight_main_d') }}</strong>. {{ t('s3_insight_main_e') }}</p>
              <div class="disaster-causes">
                <div class="cause-item"><div class="cause-text"><strong>{{ t('s3_cause1_b') }}</strong><p>{{ t('s3_cause1_p') }}</p></div></div>
                <div class="cause-item"><div class="cause-text"><strong>{{ t('s3_cause2_b') }}</strong><p>{{ t('s3_cause2_p') }}</p></div></div>
                <div class="cause-item"><div class="cause-text"><strong>{{ t('s3_cause3_b') }}</strong><p>{{ t('s3_cause3_p') }}</p></div></div>
                <div class="cause-item"><div class="cause-text"><strong>{{ t('s3_cause4_b') }}</strong><p>{{ t('s3_cause4_p') }}</p></div></div>
              </div>
              <div class="insight-conclusion">
                <strong>&#8594; {{ t('s3_concl_b') }}</strong>
                <p>{{ t('s3_concl_p_a') }} <strong>{{ t('s3_concl_p_b') }}</strong>.</p>
              </div>
            </div>
          </div>
        </div>

        <div class="summary-purple">
          <h3>{{ t('s3_summary_h') }}</h3>
          <div class="summary-points">
            <div class="summary-point"><span class="check-icon"></span><span class="point-text"><strong>{{ t('s3_sum_li1_b') }}</strong> {{ t('s3_sum_li1_r') }}</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">{{ t('s3_sum_li2_a') }} <strong>{{ t('s3_sum_li2_b1') }}</strong> {{ t('s3_sum_li2_m1') }} <strong>{{ t('s3_sum_li2_b2') }}</strong> {{ t('s3_sum_li2_m2') }} <strong>{{ t('s3_sum_li2_b3') }}</strong> {{ t('s3_sum_li2_end') }}</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">{{ t('s3_sum_li3_a') }} <strong>{{ t('s3_sum_li3_b') }}</strong></span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text"><strong>{{ t('s3_sum_li4_b') }}</strong> {{ t('s3_sum_li4_r') }}</span></div>
          </div>
          <div class="next-section-preview">
            <h4>{{ t('s3_next_h') }}</h4>
            <p>{{ t('s3_next_p_a') }} <strong>{{ t('s3_next_p_b') }}</strong> {{ t('s3_next_p_c') }} <strong>{{ t('s3_next_p_d') }}</strong> {{ t('s3_next_p_e') }}</p>
          </div>
        </div>
      </div>
    </ng-template>

    <!-- ============ SECTION 4: VULNERABILITY ============ -->
    <ng-template #sec4>
      <div class="section4-vulnerability">
        <div class="section-header">
          <h1>{{ t('s4_title') }}</h1>
          <p class="section-subtitle">{{ t('s4_subtitle') }}</p>
        </div>

        <div class="definition-box vulnerability-definition">
          <div class="definition-content">
            <h3>{{ t('s4_def_h') }}</h3>
            <p class="inform-definition-p"><strong>{{ t('inform_definition_prefix') }}</strong> {{ t('s4_def_p1') }}</p>
            <p class="definition-explanation">{{ t('s4_def_p2a') }} <strong>{{ t('s4_def_p2b') }}</strong>. {{ t('s4_def_p2c') }}</p>
            <div class="vulnerability-emphasis"><strong>{{ t('critical_point_prefix') }}</strong> {{ t('s4_emph') }}</div>
          </div>
        </div>

        <div class="components-section">
          <h2>{{ t('s4_components_h') }}</h2>
          <p class="components-intro">{{ t('s4_components_intro') }}</p>
          <div class="component-selector">
            <button class="component-button" [class.active]="s4Category() === 'socioeconomic'" (click)="s4Category.set('socioeconomic')"
              [style.borderColor]="s4Category() === 'socioeconomic' ? '#E65100' : '#ddd'" [style.backgroundColor]="s4Category() === 'socioeconomic' ? '#FFF3E0' : 'white'">
              <div class="component-label"><strong>{{ t('s4_comp1_b') }}</strong><p>{{ t('s4_comp1_p') }}</p></div>
            </button>
            <button class="component-button" [class.active]="s4Category() === 'groups'" (click)="s4Category.set('groups')"
              [style.borderColor]="s4Category() === 'groups' ? '#FF9800' : '#ddd'" [style.backgroundColor]="s4Category() === 'groups' ? '#FFF3E0' : 'white'">
              <div class="component-label"><strong>{{ t('s4_comp2_b') }}</strong><p>{{ t('s4_comp2_p') }}</p></div>
            </button>
          </div>

          @if (s4Category() === 'socioeconomic') {
            <div class="category-content socioeconomic-content">
              <h3>{{ t('s4_socio_h') }}</h3>
              <p class="category-description">{{ t('s4_socio_intro') }}</p>
              <div class="indicators-grid">
                @for (indicator of SOCIOECONOMIC_INDICATORS; track indicator.id) {
                  <div class="indicator-card">
                    <div class="indicator-header" [style.backgroundColor]="indicator.color"><h4>{{ tx(indicator.category) }}</h4></div>
                    <div class="indicator-body">
                      <div class="indicator-metrics">
                        @for (metric of indicator.indicators; track metric.name.en) {
                          <div class="metric-row severity-{{ metric.severity }}"><span class="metric-name">{{ tx(metric.name) }}</span><span class="metric-value">{{ tx(metric.value) }}</span></div>
                        }
                      </div>
                      <div class="indicator-impact"><strong>{{ t('why_matters_prefix') }}</strong> {{ tx(indicator.impact) }}</div>
                    </div>
                  </div>
                }
              </div>
            </div>
          }

          @if (s4Category() === 'groups') {
            <div class="category-content groups-content">
              <h3>{{ t('s4_groups_h') }}</h3>
              <p class="category-description">{{ t('s4_groups_intro') }}</p>
              <div class="groups-grid">
                @for (group of VULNERABLE_GROUPS; track group.id) {
                  <div class="group-card" [class.selected]="s4Group()?.id === group.id" (click)="s4ToggleGroup(group)"
                    [style.borderColor]="s4Group()?.id === group.id ? group.color : '#E0E0E0'">
                    <div class="group-header">
                      <div class="group-info">
                        <h4>{{ tx(group.name) }}</h4>
                        <div class="group-stats"><span class="stat">{{ tx(group.population) }} {{ t('s4_of_population') }}</span><span class="stat-divider">|</span><span class="stat">{{ tx(group.count) }}</span></div>
                      </div>
                    </div>
                    @if (s4Group()?.id === group.id) {
                      <div class="group-details">
                        <div class="why-vulnerable"><strong>{{ t('s4_why_vulnerable') }}</strong>
                          <ul>@for (reason of group.whyVulnerable; track reason.en) { <li>{{ tx(reason) }}</li> }</ul>
                        </div>
                        <div class="tanzania-context"><strong>{{ t('tanzania_context_prefix') }}</strong> {{ tx(group.tanzaniaContext) }}</div>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>

        <div class="formula-reveal-section">
          <div class="reveal-intro">
            <h2>{{ t('s4_reveal_h') }}</h2>
            <p>{{ t('s4_reveal_p_a') }} <strong>{{ t('hazard_word') }}</strong>, <strong>{{ t('exposure_word') }}</strong>, {{ t('and_word') }} <strong>{{ t('vulnerability_word') }}</strong>. {{ t('s4_reveal_p_b') }}</p>
            <button class="reveal-button" (click)="s4ShowFormula.set(!s4ShowFormula())" [style.backgroundColor]="s4ShowFormula() ? '#43A047' : '#1976D2'">
              {{ s4ShowFormula() ? t('s4_formula_revealed') : t('s4_formula_reveal_btn') }}
            </button>
          </div>
          @if (s4ShowFormula()) {
            <div class="formula-box">
              <div class="formula-title">{{ t('s4_formula_title') }}</div>
              <div class="formula-equation"><div class="formula-text">{{ t('risk_eq_lhs') }} = (H and E)<sup>1/3</sup> &times; (V)<sup>1/3</sup> &times; (LCC)<sup>1/3</sup></div></div>
              <div class="formula-highlight"><div class="highlight-arrow"></div><div class="highlight-label-single">{{ t('vulnerability_word_caps') }}</div></div>
              <div class="formula-explanation">
                <h4>{{ t('what_this_means') }}</h4>
                <div class="explanation-grid">
                  <div class="explanation-item"><div class="explanation-text"><strong>{{ t('s4_exp1_b') }}</strong><p>{{ t('s4_exp1_p') }}</p></div></div>
                  <div class="explanation-item"><div class="explanation-text"><strong>{{ t('s4_exp2_b') }}</strong><p>{{ t('s4_exp2_p') }}</p></div></div>
                  <div class="explanation-item"><div class="explanation-text"><strong>{{ t('s4_exp3_b') }}</strong><p>{{ t('s4_exp3_p') }}</p></div></div>
                  <div class="explanation-item"><div class="explanation-text"><strong>{{ t('s4_exp4_b') }}</strong><p>{{ t('s4_exp4_p') }}</p></div></div>
                </div>
                <div class="formula-note"><strong>{{ t('note_word') }}</strong> {{ t('s4_formula_note_a') }} <strong>{{ t('s4_formula_note_b') }}</strong>.</div>
              </div>
            </div>
          }
        </div>

        <div class="teaching-box vulnerability-preexisting">
          <div class="teaching-content">
            <h3>{{ t('s4_preexist_h') }}</h3>
            <div class="emphasis-grid">
              <div class="emphasis-item"><div class="emphasis-text"><strong>{{ t('s4_emph1_b') }}</strong><p>{{ t('s4_emph1_p') }}</p></div></div>
              <div class="emphasis-item"><div class="emphasis-text"><strong>{{ t('s4_emph2_b') }}</strong><p>{{ t('s4_emph2_p') }}</p></div></div>
              <div class="emphasis-item"><div class="emphasis-text"><strong>{{ t('s4_emph3_b') }}</strong><p>{{ t('s4_emph3_p') }}</p></div></div>
              <div class="emphasis-item"><div class="emphasis-text"><strong>{{ t('s4_emph4_b') }}</strong><p>{{ t('s4_emph4_p') }}</p></div></div>
            </div>
            <div class="tanzania-example-box">
              <h4>{{ t('s4_tz_example_h') }}</h4>
              <ul class="tanzania-examples">
                <li><strong>{{ t('s4_tz_li1_b') }}</strong> &#8594; {{ t('s4_tz_li1_r') }}</li>
                <li><strong>{{ t('s4_tz_li2_b') }}</strong> &#8594; {{ t('s4_tz_li2_r') }}</li>
                <li><strong>{{ t('s4_tz_li3_b') }}</strong> &#8594; {{ t('s4_tz_li3_r') }}</li>
                <li><strong>{{ t('s4_tz_li4_b') }}</strong> &#8594; {{ t('s4_tz_li4_r') }}</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="summary-purple">
          <h3>{{ t('s4_summary_h') }}</h3>
          <div class="summary-points">
            <div class="summary-point"><span class="check-icon"></span><span class="point-text"><strong>{{ t('s4_sum_li1_b') }}</strong> {{ t('s4_sum_li1_r') }}</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">{{ t('s4_sum_li2_a') }} <strong>{{ t('s4_sum_li2_b') }}</strong> {{ t('s4_sum_li2_r') }}</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">{{ t('s4_sum_li3_a') }} <strong>{{ t('s4_sum_li3_b') }}</strong> {{ t('s4_sum_li3_r') }}</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">{{ t('s4_sum_li4_a') }} <strong>{{ t('s4_sum_li4_b') }}</strong> {{ t('s4_sum_li4_r') }}</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text"><strong>{{ t('s4_sum_li5_b') }}</strong> {{ t('s4_sum_li5_r') }}</span></div>
          </div>
          <div class="next-section-preview">
            <h4>{{ t('s4_next_h') }}</h4>
            <p>{{ t('s4_next_p_a') }} <strong>{{ t('coping_capacity_word') }}</strong> {{ t('s4_next_p_b') }}</p>
          </div>
        </div>
      </div>
    </ng-template>
    <!-- ============ SECTION 5: COPING CAPACITY ============ -->
    <ng-template #sec5>
      <div class="section5-coping">
        <div class="section-header">
          <h1>{{ t('s5_title') }}</h1>
          <p class="section-subtitle">{{ t('s5_subtitle') }}</p>
        </div>

        <div class="definition-box coping-definition">
          <div class="definition-content">
            <h3>{{ t('s5_def_h') }}</h3>
            <p class="inform-definition-p"><strong>{{ t('inform_definition_prefix') }}</strong> {{ t('s5_def_p1') }}</p>
            <p class="definition-explanation"><strong>{{ t('s5_def_p2b') }}</strong> {{ t('s5_def_p2r') }}</p>
            <div class="capacity-note"><strong>{{ t('s5_lcc_note_b') }}</strong> {{ t('s5_lcc_note_r') }}</div>
          </div>
        </div>

        <div class="framework-section">
          <h2>{{ t('s5_framework_h') }}</h2>
          <p class="framework-intro">{{ t('s5_framework_intro') }}</p>
          <div class="phases-selector">
            @for (phase of PHASE_TABS; track phase.id) {
              <button class="phase-button" [class.active]="s5Phase() === phase.id" (click)="s5Phase.set($any(phase.id))"><span>{{ tx(phase.label) }}</span></button>
            }
          </div>
          <div class="phases-display">
            @for (phase of s5VisiblePhases(); track phase.id) {
              <div class="phase-card" [style.borderColor]="phase.color">
                <div class="phase-header" [style.backgroundColor]="phase.color"><h3>{{ tx(phase.name) }}</h3></div>
                <div class="phase-body">
                  <p class="phase-description">{{ tx(phase.description) }}</p>
                  <div class="activities-list"><strong>{{ t('s5_key_activities') }}</strong>
                    <ul>@for (activity of phase.activities; track activity.en) { <li>{{ tx(activity) }}</li> }</ul>
                  </div>
                </div>
              </div>
            }
          </div>
        </div>

        <div class="components-section">
          <h2>{{ t('s5_components_h') }}</h2>
          <p class="components-intro">{{ t('s5_components_intro') }}</p>
          <div class="capacity-components-grid">
            @for (component of CAPACITY_COMPONENTS; track component.id) {
              <div class="capacity-component-card" [class.selected]="s5Component()?.id === component.id" (click)="s5ToggleComponent(component)"
                [style.borderColor]="s5Component()?.id === component.id ? component.color : '#E0E0E0'">
                <div class="component-header" [style.backgroundColor]="component.color"><h4>{{ tx(component.name) }}</h4></div>
                <div class="component-body">
                  <p class="component-description">{{ tx(component.description) }}</p>
                  <div class="indicators-list">
                    @for (indicator of component.indicators; track indicator.name.en) {
                      <div class="indicator-row level-{{ indicator.level }}"><span class="indicator-name">{{ tx(indicator.name) }}</span><span class="indicator-status">{{ tx(indicator.status) }}</span></div>
                    }
                  </div>
                  <div class="component-note"><strong>{{ t('tanzania_prefix') }}</strong> {{ tx(component.tanzaniaNote) }}</div>
                </div>
              </div>
            }
          </div>
        </div>

        <div class="comparison-section">
          <h2>{{ t('s5_capacity_diff_h') }}</h2>
          <p class="comparison-intro"><strong>{{ t('s5_capacity_diff_b') }}</strong> {{ t('s5_capacity_diff_m') }} <strong>{{ t('s5_capacity_diff_b2') }}</strong> {{ t('s5_capacity_diff_end') }}</p>
          <div class="comparison-controls">
            @for (view of COMPARISON_VIEWS; track view.id) {
              <button class="comparison-button" [class.active]="s5ComparisonView() === view.id" (click)="s5ComparisonView.set($any(view.id))">{{ tx(view.label) }}</button>
            }
          </div>
          <div class="comparison-display coping {{ s5ComparisonView() === 'both' ? 'side-by-side' : 'single' }}">
            @if (s5ComparisonView() === 'both' || s5ComparisonView() === 'high') {
              <div class="scenario-column high-capacity">
                <div class="scenario-title" [style.backgroundColor]="COMPARISON_SCENARIOS.high.color">{{ tx(COMPARISON_SCENARIOS.high.title) }}</div>
                @for (example of COMPARISON_SCENARIOS.high.examples; track example.hazard.en) {
                  <div class="scenario-example">
                    <div class="example-hazard">{{ tx(example.hazard) }}</div>
                    <div class="example-outcome success">{{ tx(example.outcome) }}</div>
                    <ul class="example-details">@for (detail of example.details; track detail.en) { <li>{{ tx(detail) }}</li> }</ul>
                  </div>
                }
              </div>
            }
            @if (s5ComparisonView() === 'both' || s5ComparisonView() === 'low') {
              <div class="scenario-column low-capacity">
                <div class="scenario-title" [style.backgroundColor]="COMPARISON_SCENARIOS.low.color">{{ tx(COMPARISON_SCENARIOS.low.title) }}</div>
                @for (example of COMPARISON_SCENARIOS.low.examples; track example.hazard.en) {
                  <div class="scenario-example">
                    <div class="example-hazard">{{ tx(example.hazard) }}</div>
                    <div class="example-outcome crisis">{{ tx(example.outcome) }}</div>
                    <ul class="example-details">@for (detail of example.details; track detail.en) { <li>{{ tx(detail) }}</li> }</ul>
                  </div>
                }
              </div>
            }
          </div>
        </div>

        <div class="formula-reveal-section">
          <div class="reveal-intro">
            <h2>{{ t('s5_reveal_h') }}</h2>
            <p>{{ t('s5_reveal_p_a') }} <strong>{{ t('vulnerability_word') }}</strong> {{ t('s5_reveal_p_b') }} <strong>{{ t('lcc_long_word') }}</strong> {{ t('s5_reveal_p_c') }}</p>
            <button class="reveal-button" (click)="s5ShowFormula.set(!s5ShowFormula())" [style.backgroundColor]="s5ShowFormula() ? '#43A047' : '#1976D2'">
              {{ s5ShowFormula() ? t('s5_second_revealed') : t('s5_reveal_second_btn') }}
            </button>
          </div>
          @if (s5ShowFormula()) {
            <div class="formula-box">
              <div class="formula-title">{{ t('s5_formula_title') }}</div>
              <div class="formula-equation"><div class="formula-text">{{ t('risk_eq_lhs') }} = (H and E)<sup>1/3</sup> &times; (V)<sup>1/3</sup> &times; (LCC)<sup>1/3</sup></div></div>
              <div class="formula-highlights">
                <div class="formula-highlight"><div class="highlight-arrow"></div><div class="highlight-label-pill vulnerability">{{ t('s5_pill_v') }}</div></div>
                <div class="formula-highlight"><div class="highlight-arrow"></div><div class="highlight-label-pill capacity">{{ t('s5_pill_lcc') }}</div></div>
              </div>
              <div class="formula-explanation">
                <h4>{{ t('what_this_means') }}</h4>
                <div class="explanation-grid">
                  <div class="explanation-item"><div class="explanation-text"><strong>{{ t('s5_exp1_b') }}</strong><p>{{ t('s5_exp1_p') }}</p></div></div>
                  <div class="explanation-item"><div class="explanation-text"><strong>{{ t('s5_exp2_b') }}</strong><p>{{ t('s5_exp2_p') }}</p></div></div>
                  <div class="explanation-item"><div class="explanation-text"><strong>{{ t('s5_exp3_b') }}</strong><p>{{ t('s5_exp3_p') }}</p></div></div>
                  <div class="explanation-item"><div class="explanation-text"><strong>{{ t('s5_exp4_b') }}</strong><p>{{ t('s5_exp4_p') }}</p></div></div>
                </div>
                <div class="formula-note"><strong>{{ t('s5_formula_note_b') }}</strong> {{ t('s5_formula_note_r') }}</div>
              </div>
            </div>
          }
        </div>

        <div class="teaching-box capacity-teaching">
          <div class="teaching-content">
            <h3>{{ t('s5_counter_h') }}</h3>
            <div class="teaching-scenario">
              <div class="scenario-title">{{ t('s5_scenario_title') }}</div>
              <div class="scenario-comparison">
                <div class="scenario-side without">
                  <h4>{{ t('s5_without_h') }}</h4>
                  <div class="scenario-outcomes">
                    <div class="outcome-item"><span class="outcome-text">{{ t('drought_word') }} &#8594; <strong>{{ t('s5_w_famine') }}</strong></span></div>
                    <div class="outcome-item"><span class="outcome-text">{{ t('epidemic_word') }} &#8594; <strong>{{ t('s5_w_massdeaths') }}</strong></span></div>
                    <div class="outcome-item"><span class="outcome-text">{{ t('flood_word') }} &#8594; <strong>{{ t('s5_w_displacement') }}</strong></span></div>
                  </div>
                </div>
                <div class="scenario-divider">&#8594;</div>
                <div class="scenario-side with">
                  <h4>{{ t('s5_with_h') }}</h4>
                  <div class="scenario-outcomes">
                    <div class="outcome-item"><span class="outcome-text">{{ t('drought_word') }} &#8594; <strong>{{ t('s5_y_food') }}</strong></span></div>
                    <div class="outcome-item"><span class="outcome-text">{{ t('epidemic_word') }} &#8594; <strong>{{ t('s5_y_outbreak') }}</strong></span></div>
                    <div class="outcome-item"><span class="outcome-text">{{ t('flood_word') }} &#8594; <strong>{{ t('s5_y_evac') }}</strong></span></div>
                  </div>
                </div>
              </div>
              <div class="scenario-conclusion">
                <strong>&#8594; {{ t('s5_concl_b') }}</strong>
                <p>{{ t('s5_concl_p') }}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="summary-purple">
          <h3>{{ t('s5_summary_h') }}</h3>
          <div class="summary-points">
            <div class="summary-point"><span class="check-icon"></span><span class="point-text"><strong>{{ t('s5_sum_li1_b') }}</strong> {{ t('s5_sum_li1_r') }}</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">{{ t('s5_sum_li2_a') }} <strong>{{ t('s5_sum_li2_b') }}</strong> {{ t('s5_sum_li2_r') }}</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text"><strong>{{ t('s5_sum_li3_b') }}</strong> {{ t('s5_sum_li3_r') }}</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">{{ t('s5_sum_li4_a') }} <strong>{{ t('s5_sum_li4_b') }}</strong> {{ t('s5_sum_li4_r') }}</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text"><strong>{{ t('s5_sum_li5_b') }}</strong> {{ t('s5_sum_li5_r') }}</span></div>
          </div>
          <div class="next-section-preview">
            <h4>{{ t('s5_next_h') }}</h4>
            <p>{{ t('s5_next_p_a') }} <strong>{{ t('s5_next_p_b') }}</strong> {{ t('s5_next_p_c') }}</p>
          </div>
        </div>
      </div>
    </ng-template>

    <!-- ============ SECTION 6: RISK ============ -->
    <ng-template #sec6>
      <div class="section6-risk">
        <div class="section-header">
          <h1>{{ t('s6_title') }}</h1>
          <p class="section-subtitle">{{ t('s6_subtitle') }}</p>
        </div>

        <div class="definition-box risk-definition">
          <div class="definition-content">
            <h3>{{ t('s6_def_h') }}</h3>
            <p class="inform-definition-p"><strong>{{ t('inform_definition_prefix') }}</strong> {{ t('s6_def_p1') }}</p>
            <p class="definition-explanation">{{ t('s6_def_p2a') }} <strong>{{ t('s6_def_p2b') }}</strong>. {{ t('s6_def_p2c') }}</p>
            <div class="risk-emphasis"><strong>{{ t('critical_point_prefix') }}</strong> {{ t('s6_emph') }}</div>
          </div>
        </div>

        <div class="formula-reveal-section complete">
          <div class="reveal-intro">
            <h2>{{ t('s6_complete_h') }}</h2>
            <p>{{ t('s6_complete_p_a') }} <strong>{{ t('hazard_exposure_word') }}</strong>, <strong>{{ t('vulnerability_word') }}</strong>, {{ t('and_word') }} <strong>{{ t('coping_capacity_word') }}</strong>. {{ t('s6_complete_p_b') }}</p>
            <button class="reveal-button" (click)="s6ShowCompleteFormula.set(!s6ShowCompleteFormula())" [style.backgroundColor]="s6ShowCompleteFormula() ? '#43A047' : '#1976D2'">
              {{ s6ShowCompleteFormula() ? t('s6_complete_revealed') : t('s6_complete_reveal_btn') }}
            </button>
          </div>
          @if (s6ShowCompleteFormula()) {
            <div class="formula-box complete-formula">
              <div class="formula-title">{{ t('s6_formula_title') }}</div>
              <div class="formula-equation large"><div class="formula-text">{{ t('risk_eq_lhs') }} = (H and E)<sup>1/3</sup> &times; (V)<sup>1/3</sup> &times; (LCC)<sup>1/3</sup></div></div>
              <div class="formula-highlights-complete">
                <div class="formula-highlight hazard"><div class="highlight-arrow"></div><div class="highlight-label">{{ t('s6_hl_he') }}</div><div class="highlight-description">{{ t('s6_hl_he_d') }}</div></div>
                <div class="formula-highlight vulnerability"><div class="highlight-arrow"></div><div class="highlight-label">{{ t('vulnerability_word_caps') }}</div><div class="highlight-description">{{ t('s6_hl_v_d') }}</div></div>
                <div class="formula-highlight capacity"><div class="highlight-arrow"></div><div class="highlight-label">{{ t('s6_hl_lcc') }}</div><div class="highlight-description">{{ t('s6_hl_lcc_d') }}</div></div>
              </div>
              <div class="formula-explanation complete">
                <h4>{{ t('s6_geo_h') }}</h4>
                <div class="geometric-comparison">
                  <div class="comparison-col problem">
                    <div class="comparison-title">{{ t('s6_arith_title') }}</div>
                    <div class="comparison-formula">{{ t('risk_eq_lhs') }} = (H and E + V + LCC) &divide; 3</div>
                    <div class="comparison-problem"><strong>{{ t('problem_prefix') }}</strong> {{ t('s6_arith_problem') }}</div>
                    <div class="comparison-example">{{ t('s6_arith_example') }}</div>
                  </div>
                  <div class="comparison-col benefit">
                    <div class="comparison-title">{{ t('s6_geo_title') }}</div>
                    <div class="comparison-formula">{{ t('risk_eq_lhs') }} = (H and E &times; V &times; LCC)<sup>1/3</sup></div>
                    <div class="comparison-benefit"><strong>{{ t('benefit_prefix') }}</strong> {{ t('s6_geo_benefit') }}</div>
                    <div class="comparison-example">{{ t('s6_geo_example') }}</div>
                  </div>
                </div>
                <div class="geometric-insight"><strong>{{ t('key_insight_prefix') }}</strong> {{ t('s6_geo_insight') }}</div>
              </div>
            </div>
          }
        </div>

        <div class="tanzania-risk-section">
          <h2>{{ t('s6_tz_score_h') }}</h2>
          <p class="section-intro">{{ t('s6_tz_score_intro') }}</p>
          <div class="risk-score-card">
            <div class="score-main" [style.borderColor]="TANZANIA_RISK.classificationColor">
              <div class="score-label">{{ t('s6_tz_score_label') }}</div>
              <div class="score-value" [style.color]="TANZANIA_RISK.classificationColor">{{ TANZANIA_RISK.overall }}</div>
              <div class="score-classification" [style.backgroundColor]="TANZANIA_RISK.classificationColor">{{ tx(TANZANIA_RISK.classification) }}</div>
              <div class="score-rank">{{ tx(TANZANIA_RISK.rank) }}</div>
            </div>
            <div class="dimensions-breakdown">
              <h4>{{ t('s6_dim_breakdown') }}</h4>
              <div class="dimension-bars">
                <div class="dimension-bar">
                  <div class="dimension-label"><span>{{ t('hazard_exposure_word') }}</span></div>
                  <div class="dimension-value-bar"><div class="dimension-fill hazard" [style.width]="pct(TANZANIA_RISK.dimensions.hazardExposure)"><span class="dimension-score">{{ TANZANIA_RISK.dimensions.hazardExposure }}</span></div></div>
                </div>
                <div class="dimension-bar">
                  <div class="dimension-label"><span>{{ t('vulnerability_word') }}</span></div>
                  <div class="dimension-value-bar"><div class="dimension-fill vulnerability" [style.width]="pct(TANZANIA_RISK.dimensions.vulnerability)"><span class="dimension-score">{{ TANZANIA_RISK.dimensions.vulnerability }}</span></div></div>
                </div>
                <div class="dimension-bar">
                  <div class="dimension-label"><span>{{ t('lcc_long_word') }}</span></div>
                  <div class="dimension-value-bar"><div class="dimension-fill capacity" [style.width]="pct(TANZANIA_RISK.dimensions.lackCoping)"><span class="dimension-score">{{ TANZANIA_RISK.dimensions.lackCoping }}</span></div></div>
                </div>
              </div>
              <div class="calculation-display">
                <div class="calculation-formula">{{ t('risk_eq_lhs') }} = ({{ TANZANIA_RISK.dimensions.hazardExposure }} &times; {{ TANZANIA_RISK.dimensions.vulnerability }} &times; {{ TANZANIA_RISK.dimensions.lackCoping }})<sup>1/3</sup> = <strong>{{ TANZANIA_RISK.overall }}</strong></div>
              </div>
            </div>
          </div>
          <div class="context-box"><div class="context-text"><strong>{{ t('what_this_means_prefix') }}</strong> {{ tx(TANZANIA_RISK.context) }}</div></div>
        </div>

        <div class="classification-section">
          <h2>{{ t('s6_classification_h') }}</h2>
          <p class="section-intro">{{ t('s6_classification_intro') }}</p>
          <div class="risk-levels-table">
            @for (level of RISK_LEVELS; track level.key) {
              <div class="risk-level-row" [class.current]="TANZANIA_RISK.classification.en === level.level.en" [style.borderColor]="level.color">
                <div class="level-color" [style.backgroundColor]="level.color"></div>
                <div class="level-info"><div class="level-name">{{ tx(level.level) }}</div><div class="level-range">{{ level.range }}</div></div>
                <div class="level-description">{{ tx(level.description) }}</div>
                @if (TANZANIA_RISK.classification.en.includes(level.level.en)) { <div class="current-indicator">{{ t('s6_tz_is_here') }}</div> }
              </div>
            }
          </div>
        </div>

        <div class="comparison-section">
          <h2>{{ t('s6_compare_h') }}</h2>
          <div class="comparison-controls">
            <button class="comparison-tab" [class.active]="s6Comparison() === 'regional'" (click)="s6Comparison.set('regional')">{{ t('s6_tab_regional') }}</button>
            <button class="comparison-tab" [class.active]="s6Comparison() === 'dimensional'" (click)="s6Comparison.set('dimensional')">{{ t('s6_tab_dimensional') }}</button>
          </div>
          @if (s6Comparison() === 'regional') {
            <div class="comparison-content">
              <div class="comparison-bars">
                @for (item of REGIONAL_COMPARISONS; track item.key) {
                  <div class="comparison-bar-row">
                    <div class="comparison-label">{{ tx(item.region) }}</div>
                    <div class="comparison-bar-container"><div class="comparison-bar-fill" [style.width]="pct(item.score)" [style.backgroundColor]="item.color"><span class="comparison-score">{{ item.score }}</span></div></div>
                  </div>
                }
              </div>
              <div class="comparison-insight"><strong>{{ t('insight_prefix') }}</strong> {{ t('s6_regional_insight') }}</div>
            </div>
          }
          @if (s6Comparison() === 'dimensional') {
            <div class="comparison-content">
              <div class="dimension-comparison-grid">
                @for (item of DIMENSION_COMPARISONS; track item.key) {
                  <div class="dimension-comparison-card">
                    <div class="dimension-card-header" [style.backgroundColor]="item.color">{{ tx(item.dimension) }}</div>
                    <div class="dimension-card-body">
                      <div class="dimension-score-row"><span class="score-label">{{ t('s6_row_tanzania') }}</span><span class="score-value" [style.color]="item.color">{{ item.tanzania }}</span></div>
                      <div class="dimension-score-row"><span class="score-label">{{ t('s6_row_eastafrica') }}</span><span class="score-value">{{ item.eastAfrica }}</span></div>
                      <div class="dimension-score-row"><span class="score-label">{{ t('s6_row_global') }}</span><span class="score-value">{{ item.global }}</span></div>
                    </div>
                  </div>
                }
              </div>
              <div class="comparison-insight"><strong>{{ t('key_finding_prefix') }}</strong> {{ t('s6_dimensional_insight') }}</div>
            </div>
          }
        </div>

        <div class="scenario-section">
          <h2>{{ t('s6_scenario_h') }}</h2>
          <p class="section-intro">{{ t('s6_scenario_intro') }}</p>
          <div class="scenario-tool">
            <div class="scenario-controls">
              <div class="scenario-slider">
                <label><span class="slider-label">{{ t('hazard_exposure_word') }}</span></label>
                <input type="range" min="0" max="10" step="0.1" [value]="s6HE()" (input)="onSlider('he', $event)" class="slider hazard" />
                <span class="slider-value">{{ s6HE().toFixed(1) }}</span>
              </div>
              <div class="scenario-slider">
                <label><span class="slider-label">{{ t('vulnerability_word') }}</span></label>
                <input type="range" min="0" max="10" step="0.1" [value]="s6V()" (input)="onSlider('v', $event)" class="slider vulnerability" />
                <span class="slider-value">{{ s6V().toFixed(1) }}</span>
              </div>
              <div class="scenario-slider">
                <label><span class="slider-label">{{ t('lcc_long_word') }}</span></label>
                <input type="range" min="0" max="10" step="0.1" [value]="s6LCC()" (input)="onSlider('lcc', $event)" class="slider capacity" />
                <span class="slider-value">{{ s6LCC().toFixed(1) }}</span>
              </div>
            </div>
            <div class="scenario-result">
              <div class="scenario-calculation">
                <div class="scenario-formula">({{ s6HE().toFixed(1) }} &times; {{ s6V().toFixed(1) }} &times; {{ s6LCC().toFixed(1) }})<sup>1/3</sup></div>
                <div class="scenario-equals">=</div>
                <div class="scenario-risk-score" [style.backgroundColor]="scenarioLevel().color">{{ scenarioRisk() }}</div>
              </div>
              <div class="scenario-classification" [style.color]="scenarioLevel().color">{{ tx(scenarioLevel().level) }} {{ t('risk_suffix') }}</div>
              <div class="scenario-description">{{ tx(scenarioLevel().description) }}</div>
            </div>
            <div class="scenario-examples">
              <h4>{{ t('s6_try_scenarios') }}</h4>
              <div class="scenario-buttons">
                <button class="scenario-preset-btn" (click)="s6Preset(3.8, 3.0, 3.9)">{{ t('s6_preset1') }}<span class="preset-hint">(V: 5.1 &#8594; 3.0)</span></button>
                <button class="scenario-preset-btn" (click)="s6Preset(3.8, 5.1, 2.5)">{{ t('s6_preset2') }}<span class="preset-hint">(LCC: 3.9 &#8594; 2.5)</span></button>
                <button class="scenario-preset-btn" (click)="s6Preset(3.8, 3.0, 2.5)">{{ t('s6_preset3') }}<span class="preset-hint">{{ t('s6_preset3_hint') }}</span></button>
                <button class="scenario-preset-btn reset" (click)="s6Preset(3.8, 5.1, 3.9)">{{ t('s6_preset_reset') }}</button>
              </div>
            </div>
          </div>
        </div>

        <div class="teaching-box risk-manageable">
          <div class="teaching-content">
            <h3>{{ t('s6_manageable_h') }}</h3>
            <div class="manageable-grid">
              <div class="manageable-item"><div class="manageable-text"><strong>{{ t('s6_mng1_b') }}</strong><p>{{ t('s6_mng1_p') }}</p></div></div>
              <div class="manageable-item"><div class="manageable-text"><strong>{{ t('s6_mng2_b') }}</strong><p>{{ t('s6_mng2_p') }}</p></div></div>
              <div class="manageable-item"><div class="manageable-text"><strong>{{ t('s6_mng3_b') }}</strong><p>{{ t('s6_mng3_p') }}</p></div></div>
              <div class="manageable-item"><div class="manageable-text"><strong>{{ t('s6_mng4_b') }}</strong><p>{{ t('s6_mng4_p') }}</p></div></div>
            </div>
            <div class="action-pathways">
              <h4>{{ t('s6_pathways_h') }}</h4>
              <div class="pathway-grid">
                <div class="pathway"><strong>{{ t('s6_path1_b') }}</strong><p>{{ t('s6_path1_p') }}</p></div>
                <div class="pathway"><strong>{{ t('s6_path2_b') }}</strong><p>{{ t('s6_path2_p') }}</p></div>
                <div class="pathway"><strong>{{ t('s6_path3_b') }}</strong><p>{{ t('s6_path3_p') }}</p></div>
                <div class="pathway"><strong>{{ t('s6_path4_b') }}</strong><p>{{ t('s6_path4_p') }}</p></div>
              </div>
            </div>
            <div class="manageable-conclusion"><strong>{{ t('bottom_line_prefix') }}</strong> {{ t('s6_bottom_line') }}</div>
          </div>
        </div>

        <div class="risk-summary">
          <h3>{{ t('s6_summary_h') }}</h3>
          <div class="summary-points">
            <div class="summary-point"><span class="check-icon"></span><span class="point-text"><strong>{{ t('s6_sum_li1_b') }}</strong> {{ t('s6_sum_li1_r') }}</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">{{ t('s6_sum_li2_a') }} <strong>{{ t('s6_sum_li2_b') }}</strong> {{ t('s6_sum_li2_r') }}</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">{{ t('s6_sum_li3_a') }} <strong>{{ t('s6_sum_li3_b') }}</strong> {{ t('s6_sum_li3_r') }}</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">{{ t('s6_sum_li4_a') }} <strong>{{ t('s6_sum_li4_b') }}</strong> {{ t('s6_sum_li4_r') }}</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">{{ t('s6_sum_li5_a') }} <strong>{{ t('s6_sum_li5_b') }}</strong> {{ t('s6_sum_li5_r') }}</span></div>
          </div>
          <div class="module-completion">
            <h3>{{ t('s6_congrats_h') }}</h3>
            <p class="completion-message">{{ t('s6_congrats_p') }}</p>
            <div class="next-module-preview">
              <h4>{{ t('s6_whats_next_h') }}</h4>
              <p><strong>{{ t('s6_next_module_b') }}</strong> {{ t('s6_next_module_r') }}</p>
            </div>
          </div>
        </div>
      </div>
    </ng-template>
  `,
})
export class PublicInformEducationComponent {
  // ===== Bilingual plumbing =====
  /** Portal language signal source (en|sw). */
  L = inject(PortalLabels);
  /** Resolve a bilingual data object `{ en, sw }` in the active language. */
  tx(o: TxEntry | undefined | null): string {
    if (!o) return '';
    return o[this.L.lang()] ?? o.en;
  }
  /** Resolve a template-chrome key from the component-local table. */
  t(key: string): string {
    return this.TR[key]?.[this.L.lang()] ?? this.TR[key]?.en ?? key;
  }

  // ===== Course state =====
  readonly SECTIONS: { id: number; title: TxEntry; subtitle: TxEntry }[] = [
    { id: 1, title: { en: 'Hazard', sw: 'Janga' }, subtitle: { en: 'What Can Happen?', sw: 'Nini Kinaweza Kutokea?' } },
    { id: 2, title: { en: 'Exposure', sw: 'Uwazi' }, subtitle: { en: "Who is in Harm's Way?", sw: 'Nani Yumo Hatarini?' } },
    { id: 3, title: { en: 'Sensitivity', sw: 'Usikivu' }, subtitle: { en: 'Why Different Impacts?', sw: 'Kwa Nini Athari Tofauti?' } },
    { id: 4, title: { en: 'Vulnerability', sw: 'Uathirikaji' }, subtitle: { en: 'Why Some Suffer More?', sw: 'Kwa Nini Wengine Huathirika Zaidi?' } },
    { id: 5, title: { en: 'Coping Capacity', sw: 'Uwezo wa Kukabili' }, subtitle: { en: 'Can We Manage It?', sw: 'Tunaweza Kuimudu?' } },
    { id: 6, title: { en: 'Risk', sw: 'Hatari' }, subtitle: { en: 'Combining All Dimensions', sw: 'Kuunganisha Vipimo Vyote' } },
  ];

  currentSection = signal(1);
  completedSections = signal<number[]>([]);
  showQuiz = signal(false);

  progressPct = computed(() => (this.completedSections().length / 6) * 100);
  stepState(id: number): string {
    if (this.currentSection() === id) return 'current';
    if (this.completedSections().includes(id)) return 'completed';
    return 'pending';
  }
  isCompleted(id: number): boolean { return this.completedSections().includes(id); }

  // ===== Navigation =====
  takeQuiz(): void { this.showQuiz.set(true); }
  previous(): void {
    if (this.currentSection() > 1) { this.currentSection.update(s => s - 1); this.showQuiz.set(false); this.resetQuiz(); }
  }
  goNext(): void {
    if (this.currentSection() < 6) { this.currentSection.update(s => s + 1); this.showQuiz.set(false); this.resetQuiz(); }
  }
  onCourseComplete(): void { /* terminal state — the course-complete view is the end of this module */ }

  handleQuizComplete(passed: boolean): void {
    if (passed) {
      if (!this.completedSections().includes(this.currentSection())) {
        this.completedSections.update(c => [...c, this.currentSection()]);
      }
      if (this.currentSection() < 6) {
        this.currentSection.update(s => s + 1);
        this.showQuiz.set(false);
        this.resetQuiz();
      } else {
        // All sections completed — stay; the complete button appears.
        this.showQuiz.set(false);
        this.resetQuiz();
      }
    } else {
      // Failed quiz — show review option (return to the section content).
      this.showQuiz.set(false);
      this.resetQuiz();
    }
  }

  // ===== Quiz state =====
  readonly QUIZ: Record<number, any> = {
    1: {
      section: { en: 'Hazard', sw: 'Janga' },
      question: {
        en: 'According to INFORM, what is the key difference between a hazard and a disaster?',
        sw: 'Kwa mujibu wa INFORM, ni tofauti gani kuu kati ya janga na maafa?',
      },
      options: [
        { en: 'A hazard is natural, a disaster is human-made', sw: 'Janga ni la asili, maafa ni ya kutengenezwa na binadamu' },
        { en: 'A hazard is a potential threat; a disaster occurs when it affects vulnerable populations', sw: 'Janga ni tishio linalowezekana; maafa hutokea pale linapoathiri watu walio katika uathirikaji' },
        { en: 'A hazard is small-scale, a disaster is large-scale', sw: 'Janga ni la kiwango kidogo, maafa ni ya kiwango kikubwa' },
        { en: 'A hazard happens rarely, a disaster happens frequently', sw: 'Janga hutokea mara chache, maafa hutokea mara kwa mara' },
      ],
      correct: 1,
      explanation: {
        en: 'A hazard is just a potential threat (like heavy rainfall). It only becomes a disaster when it impacts exposed and vulnerable populations who cannot cope.',
        sw: 'Janga ni tishio linalowezekana tu (kama mvua kubwa). Linakuwa maafa pale tu linapoathiri watu walio wazi na walio katika uathirikaji ambao hawawezi kukabili.',
      },
    },
    2: {
      section: { en: 'Exposure', sw: 'Uwazi' },
      question: {
        en: 'What is the difference between absolute exposure and relative exposure?',
        sw: 'Ni tofauti gani kati ya uwazi kamili na uwazi linganishi?',
      },
      options: [
        { en: 'Absolute is total population exposed; relative is the percentage of total population exposed', sw: 'Kamili ni jumla ya idadi ya watu walio wazi; linganishi ni asilimia ya jumla ya idadi ya watu walio wazi' },
        { en: 'Absolute is for urban areas; relative is for rural areas', sw: 'Kamili ni kwa maeneo ya mijini; linganishi ni kwa maeneo ya vijijini' },
        { en: 'Absolute measures hazard intensity; relative measures population density', sw: 'Kamili hupima ukali wa janga; linganishi hupima msongamano wa watu' },
        { en: 'There is no difference; they mean the same thing', sw: 'Hakuna tofauti; vinamaanisha kitu kimoja' },
      ],
      correct: 0,
      explanation: {
        en: 'Absolute exposure counts the total number of people exposed (e.g., 500,000 people). Relative exposure shows what percentage of the total population is exposed (e.g., 8.5%).',
        sw: 'Uwazi kamili huhesabu jumla ya idadi ya watu walio wazi (mfano, watu 500,000). Uwazi linganishi huonyesha ni asilimia ngapi ya jumla ya idadi ya watu iliyo wazi (mfano, 8.5%).',
      },
    },
    3: {
      section: { en: 'Sensitivity', sw: 'Usikivu' },
      question: {
        en: 'Why do two districts with the same hazard exposure sometimes experience very different outcomes?',
        sw: 'Kwa nini wilaya mbili zenye uwazi sawa wa janga wakati mwingine hupata matokeo tofauti kabisa?',
      },
      options: [
        { en: 'One district has a larger population', sw: 'Wilaya moja ina idadi kubwa ya watu' },
        { en: 'Different sensitivity factors like housing quality, health infrastructure, and economic conditions', sw: 'Vipengele tofauti vya usikivu kama ubora wa makazi, miundombinu ya afya, na hali ya kiuchumi' },
        { en: 'One district is closer to the capital city', sw: 'Wilaya moja iko karibu zaidi na mji mkuu' },
        { en: 'Random chance and luck', sw: 'Bahati nasibu na bahati' },
      ],
      correct: 1,
      explanation: {
        en: 'Sensitivity factors determine how severely a hazard impacts people. Poor housing, weak health systems, inadequate infrastructure, and economic fragility increase sensitivity to harm.',
        sw: 'Vipengele vya usikivu huamua ni kwa kiasi gani janga linaathiri watu. Makazi duni, mifumo dhaifu ya afya, miundombinu isiyotosheleza, na udhaifu wa kiuchumi huongeza usikivu kwa madhara.',
      },
    },
    4: {
      section: { en: 'Vulnerability', sw: 'Uathirikaji' },
      question: {
        en: 'In the INFORM framework, vulnerability has two main components. What are they?',
        sw: 'Katika mfumo wa INFORM, uathirikaji una vijenzi viwili vikuu. Ni vipi?',
      },
      options: [
        { en: 'Natural hazards and human hazards', sw: 'Majanga ya asili na majanga ya kibinadamu' },
        { en: 'Socio-economic vulnerability and vulnerable groups', sw: 'Uathirikaji wa kijamii na kiuchumi na makundi yaliyo katika uathirikaji' },
        { en: 'Urban vulnerability and rural vulnerability', sw: 'Uathirikaji wa mijini na uathirikaji wa vijijini' },
        { en: 'Short-term vulnerability and long-term vulnerability', sw: 'Uathirikaji wa muda mfupi na uathirikaji wa muda mrefu' },
      ],
      correct: 1,
      explanation: {
        en: 'INFORM measures vulnerability through: (1) Socio-economic conditions (poverty, malnutrition, lack of access to services) and (2) Vulnerable groups (children, elderly, persons with disabilities, displaced populations).',
        sw: 'INFORM hupima uathirikaji kupitia: (1) Hali za kijamii na kiuchumi (umaskini, utapiamlo, ukosefu wa upatikanaji wa huduma) na (2) Makundi yaliyo katika uathirikaji (watoto, wazee, watu wenye ulemavu, watu waliohamishwa makazi).',
      },
    },
    5: {
      section: { en: 'Coping Capacity', sw: 'Uwezo wa Kukabili' },
      question: {
        en: 'What are the three phases of disaster management covered in the Lack of Coping Capacity dimension?',
        sw: 'Ni hatua zipi tatu za usimamizi wa maafa zinazoshughulikiwa katika kipimo cha Ukosefu wa Uwezo wa Kukabili?',
      },
      options: [
        { en: 'Warning, Evacuation, Recovery', sw: 'Onyo, Uhamishaji, Urejeshaji' },
        { en: 'Prepare, Respond, Recover', sw: 'Kujiandaa, Kuitikia, Kurejesha' },
        { en: 'Prevention, Mitigation, Adaptation', sw: 'Kuzuia, Kupunguza, Kuhimili' },
        { en: 'Risk Assessment, Early Warning, Relief', sw: 'Tathmini ya Hatari, Tahadhari ya Mapema, Misaada' },
      ],
      correct: 1,
      explanation: {
        en: "INFORM's Lack of Coping Capacity assesses a country's ability to: (1) Prepare before disasters, (2) Respond during emergencies, and (3) Recover after events. Lower capacity means higher risk.",
        sw: 'Ukosefu wa Uwezo wa Kukabili wa INFORM hutathmini uwezo wa nchi wa: (1) Kujiandaa kabla ya maafa, (2) Kuitikia wakati wa dharura, na (3) Kurejesha baada ya matukio. Uwezo mdogo zaidi humaanisha hatari kubwa zaidi.',
      },
    },
    6: {
      section: { en: 'Risk', sw: 'Hatari' },
      question: {
        en: 'Why does INFORM use a geometric mean instead of an arithmetic mean in the risk formula?',
        sw: 'Kwa nini INFORM hutumia wastani wa kijiometri badala ya wastani wa kihesabu katika fomula ya hatari?',
      },
      options: [
        { en: 'Geometric mean is easier to calculate', sw: 'Wastani wa kijiometri ni rahisi zaidi kukokotoa' },
        { en: 'Geometric mean ensures all three dimensions (H and E, V, LCC) must be addressed; weakness in any dimension significantly affects overall risk', sw: 'Wastani wa kijiometri huhakikisha vipimo vyote vitatu (H na E, V, LCC) vinapaswa kushughulikiwa; udhaifu katika kipimo chochote huathiri sana hatari ya jumla' },
        { en: 'Geometric mean produces lower risk scores', sw: 'Wastani wa kijiometri huzalisha alama za hatari za chini zaidi' },
        { en: 'Geometric mean is the international standard for all risk calculations', sw: 'Wastani wa kijiometri ni kiwango cha kimataifa kwa hesabu zote za hatari' },
      ],
      correct: 1,
      explanation: {
        en: 'Geometric mean prevents "compensation" - you can\'t offset very high vulnerability with low hazard. All three dimensions matter equally. A weakness in any dimension significantly lowers the overall score, encouraging balanced risk reduction.',
        sw: 'Wastani wa kijiometri huzuia "fidia" - huwezi kufidia uathirikaji wa juu sana kwa janga la chini. Vipimo vyote vitatu vina umuhimu sawa. Udhaifu katika kipimo chochote hupunguza sana alama ya jumla, ukihimiza upunguzaji wa hatari uliosawazishwa.',
      },
    },
  };

  selectedAnswer = signal<number | null>(null);
  showResult = signal(false);
  showExplanation = signal(false);

  currentQuiz = computed(() => this.QUIZ[this.currentSection()]);
  quizIsCorrect = computed(() => this.selectedAnswer() === this.currentQuiz()?.correct);

  resetQuiz(): void { this.selectedAnswer.set(null); this.showResult.set(false); this.showExplanation.set(false); }
  selectAnswer(i: number): void { if (!this.showResult()) this.selectedAnswer.set(i); }
  letter(i: number): string { return String.fromCharCode(65 + i); }
  optionClass(i: number): string {
    const q = this.currentQuiz();
    let c = '';
    if (this.selectedAnswer() === i) c += ' selected';
    if (this.showResult() && i === q.correct) c += ' correct';
    if (this.showResult() && this.selectedAnswer() === i && i !== q.correct) c += ' incorrect';
    return c.trim();
  }
  submitQuiz(): void { this.showResult.set(true); this.showExplanation.set(true); }
  continueQuiz(): void { this.handleQuizComplete(this.quizIsCorrect()); }

  // ===== SECTION 1: Hazard =====
  s1Category = signal<'natural' | 'human'>('natural');
  s1SelectedHazard = signal<any | null>(null);
  readonly HAZARD_CATEGORIES: Record<string, any> = {
    natural: {
      title: { en: 'Natural Hazards', sw: 'Majanga ya Asili' }, color: '#D32F2F',
      hazards: [
        { id: 'rainfall', name: { en: 'Heavy Rainfall', sw: 'Mvua Kubwa' }, frequency: { en: 'Annual', sw: 'Kila mwaka' } },
        { id: 'flood', name: { en: 'Floods (Riverine and Flash)', sw: 'Mafuriko (ya Mito na ya Ghafla)' }, frequency: { en: 'Seasonal', sw: 'Kimsimu' } },
        { id: 'drought', name: { en: 'Drought', sw: 'Ukame' }, frequency: { en: '3-5 years', sw: 'Miaka 3-5' } },
        { id: 'cyclone', name: { en: 'Cyclones', sw: 'Vimbunga' }, frequency: { en: 'Occasional', sw: 'Mara kwa mara' } },
        { id: 'waves', name: { en: 'Large Waves (Coastal)', sw: 'Mawimbi Makubwa (ya Pwani)' }, frequency: { en: 'Seasonal', sw: 'Kimsimu' } },
        { id: 'wildfire', name: { en: 'Wildfires', sw: 'Moto wa Porini' }, frequency: { en: 'Dry season', sw: 'Msimu wa kiangazi' } },
        { id: 'temperature', name: { en: 'Extreme Temperatures', sw: 'Joto la Kupita Kiasi' }, frequency: { en: 'Annual', sw: 'Kila mwaka' } },
        { id: 'heatwave', name: { en: 'Heat Waves', sw: 'Mawimbi ya Joto Kali' }, frequency: { en: 'Occasional', sw: 'Mara kwa mara' } },
        { id: 'volcano', name: { en: 'Volcanic Activity', sw: 'Mlipuko wa Volkano' }, frequency: { en: 'Rare', sw: 'Nadra' } },
        { id: 'earthquake', name: { en: 'Earthquakes', sw: 'Matetemeko ya Ardhi' }, frequency: { en: 'Rare', sw: 'Nadra' } },
        { id: 'landslide', name: { en: 'Landslides', sw: 'Maporomoko ya Ardhi' }, frequency: { en: 'Rainy season', sw: 'Msimu wa mvua' } },
      ],
    },
    human: {
      title: { en: 'Human Hazards', sw: 'Majanga ya Kibinadamu' }, color: '#C62828',
      hazards: [
        { id: 'conflict', name: { en: 'Conflict and Unrest', sw: 'Migogoro na Vurugu' }, frequency: { en: 'Variable', sw: 'Hutofautiana' } },
        { id: 'epidemic', name: { en: 'Epidemics and Disease Outbreaks', sw: 'Milipuko ya Magonjwa' }, frequency: { en: 'Variable', sw: 'Hutofautiana' } },
      ],
    },
  };
  s1CategoryKeys = Object.keys(this.HAZARD_CATEGORIES);
  s1CurrentCategory = computed(() => this.HAZARD_CATEGORIES[this.s1Category()]);
  s1SelectCategory(k: 'natural' | 'human'): void { this.s1Category.set(k); this.s1SelectedHazard.set(null); }
  s1HazardStatus(id: string): TxEntry {
    return id === 'epidemic' ? { en: 'Recently occurred (COVID-19, Cholera)', sw: 'Yalitokea hivi karibuni (COVID-19, Kipindupindu)' } :
      id === 'flood' ? { en: 'Seasonal threat (Oct-May)', sw: 'Tishio la kimsimu (Okt-Mei)' } :
      id === 'drought' ? { en: 'Current concern in central regions', sw: 'Wasiwasi wa sasa katika mikoa ya kati' } :
      { en: 'Monitored continuously', sw: 'Hufuatiliwa kwa kuendelea' };
  }
  readonly TIMELINE_YEARS = ['2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];

  // ===== SECTION 2: Exposure =====
  s2SelectedDistrict = signal<any | null>(null);
  s2OverlayStep = signal(0);
  readonly EXPOSURE_DATA = [
    { id: 'dar', name: 'Dar es Salaam', hazardZone: 450, population: 1200000, totalPopulation: 1850000, relativeExposure: 65, hazardType: 'Flood', hazardTypeLabel: { en: 'Flood', sw: 'Mafuriko' }, description: { en: 'Coastal flooding and riverine flooding zones', sw: 'Maeneo ya mafuriko ya pwani na mafuriko ya mito' } },
    { id: 'dodoma', name: 'Dodoma', hazardZone: 200, population: 150000, totalPopulation: 600000, relativeExposure: 25, hazardType: 'Flood', hazardTypeLabel: { en: 'Flood', sw: 'Mafuriko' }, description: { en: 'Seasonal riverine flooding', sw: 'Mafuriko ya mito ya kimsimu' } },
    { id: 'mwanza', name: 'Mwanza', hazardZone: 320, population: 450000, totalPopulation: 900000, relativeExposure: 50, hazardType: 'Flood', hazardTypeLabel: { en: 'Flood', sw: 'Mafuriko' }, description: { en: 'Lake Victoria flooding zones', sw: 'Maeneo ya mafuriko ya Ziwa Victoria' } },
    { id: 'arusha', name: 'Arusha', hazardZone: 180, population: 280000, totalPopulation: 700000, relativeExposure: 40, hazardType: 'Volcanic', hazardTypeLabel: { en: 'Volcanic', sw: 'Volkano' }, description: { en: 'Mt. Meru volcanic hazard zone', sw: 'Eneo la janga la volkano la Mlima Meru' } },
    { id: 'morogoro', name: 'Morogoro', hazardZone: 290, population: 380000, totalPopulation: 950000, relativeExposure: 40, hazardType: 'Flood', hazardTypeLabel: { en: 'Flood', sw: 'Mafuriko' }, description: { en: 'Riverine and flash flooding', sw: 'Mafuriko ya mito na mafuriko ya ghafla' } },
    { id: 'mbeya', name: 'Mbeya', hazardZone: 150, population: 210000, totalPopulation: 700000, relativeExposure: 30, hazardType: 'Landslide', hazardTypeLabel: { en: 'Landslide', sw: 'Maporomoko' }, description: { en: 'Highland landslide zones', sw: 'Maeneo ya maporomoko ya ardhi ya nyanda za juu' } },
  ];
  readonly OVERLAY_STEPS = [
    { id: 0, title: { en: 'Step 1: Hazard Zone', sw: 'Hatua 1: Eneo la Janga' }, description: { en: 'Areas where hazards can occur', sw: 'Maeneo ambayo majanga yanaweza kutokea' }, color: '#D32F2F' },
    { id: 1, title: { en: 'Step 2: Population', sw: 'Hatua 2: Idadi ya Watu' }, description: { en: 'Where people live and work', sw: 'Mahali watu wanapoishi na kufanya kazi' }, color: '#1976D2' },
    { id: 2, title: { en: 'Step 3: Exposure', sw: 'Hatua 3: Uwazi' }, description: { en: 'Overlap = People in hazard zones', sw: 'Mwingiliano = Watu walio katika maeneo ya janga' }, color: '#F57C00' },
  ];
  fmtNum(n: number): string { return n.toLocaleString(); }
  hazardBadgeColor(t: string): string { return t === 'Flood' ? '#D32F2F' : t === 'Volcanic' ? '#795548' : '#FF9800'; }

  // ===== SECTION 3: Sensitivity =====
  s3Selected = signal<'districtA' | 'districtB' | 'both'>('both');
  s3Factor = signal<any | null>(null);
  readonly CASE_STUDY: any = {
    districtA: {
      name: { en: 'District A', sw: 'Wilaya A' }, flood: { en: '100mm rainfall in 24 hours', sw: 'Mvua ya milimita 100 katika saa 24' },
      housing: { type: { en: 'Poor Housing', sw: 'Makazi Duni' }, details: { en: '75% mud/thatch construction, weak foundations', sw: 'Ujenzi wa udongo/nyasi 75%, misingi dhaifu' } },
      health: { type: { en: 'Weak Health', sw: 'Afya Dhaifu' }, details: { en: '45% child malnutrition, limited healthcare access', sw: 'Utapiamlo wa watoto 45%, upatikanaji mdogo wa huduma za afya' } },
      infrastructure: { type: { en: 'No Drainage', sw: 'Hakuna Mfumo wa Maji Taka' }, details: { en: 'No drainage system, dirt roads', sw: 'Hakuna mfumo wa kupitisha maji, barabara za vumbi' } },
      economic: { type: { en: 'High Poverty', sw: 'Umaskini Mkubwa' }, details: { en: '60% below poverty line, low income diversity', sw: 'Asilimia 60 chini ya mstari wa umaskini, uchache wa vyanzo vya kipato' } },
      outcome: { en: 'HIGH IMPACT', sw: 'ATHARI KUBWA' }, outcomeType: { en: 'Disaster', sw: 'Maafa' }, outcomeColor: '#D32F2F',
      outcomeDetails: { en: '500 families displaced, 12 deaths, extensive property damage, disease outbreak', sw: 'Familia 500 zimehama makazi, vifo 12, uharibifu mkubwa wa mali, mlipuko wa magonjwa' },
    },
    districtB: {
      name: { en: 'District B', sw: 'Wilaya B' }, flood: { en: '100mm rainfall in 24 hours', sw: 'Mvua ya milimita 100 katika saa 24' },
      housing: { type: { en: 'Strong Housing', sw: 'Makazi Imara' }, details: { en: '80% concrete/permanent construction, proper foundations', sw: 'Ujenzi wa zege/wa kudumu 80%, misingi imara' } },
      health: { type: { en: 'Good Health', sw: 'Afya Nzuri' }, details: { en: '10% child malnutrition, good healthcare access', sw: 'Utapiamlo wa watoto 10%, upatikanaji mzuri wa huduma za afya' } },
      infrastructure: { type: { en: 'Good Drainage', sw: 'Mfumo Mzuri wa Maji Taka' }, details: { en: 'Modern drainage system, paved roads', sw: 'Mfumo wa kisasa wa kupitisha maji, barabara za lami' } },
      economic: { type: { en: 'Lower Poverty', sw: 'Umaskini Mdogo' }, details: { en: '20% below poverty line, diverse livelihoods', sw: 'Asilimia 20 chini ya mstari wa umaskini, vyanzo vya kipato vya aina mbalimbali' } },
      outcome: { en: 'LOW IMPACT', sw: 'ATHARI NDOGO' }, outcomeType: { en: 'Manageable', sw: 'Inayoweza Kuimudika' }, outcomeColor: '#43A047',
      outcomeDetails: { en: 'Minor flooding, no deaths, limited property damage, quick recovery', sw: 'Mafuriko madogo, hakuna vifo, uharibifu mdogo wa mali, urejeshaji wa haraka' },
    },
  };
  readonly SENSITIVITY_FACTORS = [
    { id: 'housing', name: { en: 'Housing Quality', sw: 'Ubora wa Makazi' }, color: '#FF9800',
      indicators: [ { label: { en: 'Mud/thatch housing', sw: 'Makazi ya udongo/nyasi' }, value: '45%', risk: 'high' }, { label: { en: 'Concrete/permanent housing', sw: 'Makazi ya zege/ya kudumu' }, value: '35%', risk: 'medium' }, { label: { en: 'Improved housing', sw: 'Makazi yaliyoboreshwa' }, value: '20%', risk: 'low' } ],
      description: { en: 'Poor housing collapses easily during floods, landslides, and earthquakes', sw: 'Makazi duni huporomoka kwa urahisi wakati wa mafuriko, maporomoko ya ardhi, na matetemeko ya ardhi' },
      tanzaniaNote: { en: 'Rural areas have 65% traditional housing vs 20% in urban centers', sw: 'Maeneo ya vijijini yana makazi ya kiasili 65% dhidi ya 20% katika vituo vya mijini' } },
    { id: 'health', name: { en: 'Health Status', sw: 'Hali ya Afya' }, color: '#E91E63',
      indicators: [ { label: { en: 'Child malnutrition (under-5)', sw: 'Utapiamlo wa watoto (chini ya miaka 5)' }, value: '31%', risk: 'high' }, { label: { en: 'Access to healthcare', sw: 'Upatikanaji wa huduma za afya' }, value: '55%', risk: 'medium' }, { label: { en: 'Disease prevalence (malaria)', sw: 'Kuenea kwa magonjwa (malaria)' }, value: '40%', risk: 'high' } ],
      description: { en: 'Malnourished and sick people are more likely to die during droughts and epidemics', sw: 'Watu wenye utapiamlo na wagonjwa wana uwezekano mkubwa zaidi wa kufa wakati wa ukame na milipuko ya magonjwa' },
      tanzaniaNote: { en: 'Coastal regions show higher disease prevalence due to climate conditions', sw: 'Mikoa ya pwani inaonyesha kuenea zaidi kwa magonjwa kutokana na hali ya tabianchi' } },
    { id: 'infrastructure', name: { en: 'Infrastructure', sw: 'Miundombinu' }, color: '#3F51B5',
      indicators: [ { label: { en: 'Drainage systems', sw: 'Mifumo ya kupitisha maji' }, value: '30%', risk: 'high' }, { label: { en: 'All-weather roads', sw: 'Barabara za kila majira' }, value: '45%', risk: 'medium' }, { label: { en: 'Clean water access', sw: 'Upatikanaji wa maji safi' }, value: '62%', risk: 'medium' } ],
      description: { en: 'Poor drainage amplifies flood impacts; bad roads isolate communities during crises', sw: 'Mfumo duni wa kupitisha maji huongeza athari za mafuriko; barabara mbovu hutenga jamii wakati wa majanga' },
      tanzaniaNote: { en: 'Infrastructure quality varies greatly between regions', sw: 'Ubora wa miundombinu hutofautiana sana kati ya mikoa' } },
    { id: 'economic', name: { en: 'Economic Status', sw: 'Hali ya Kiuchumi' }, color: '#4CAF50',
      indicators: [ { label: { en: 'Below poverty line', sw: 'Chini ya mstari wa umaskini' }, value: '26%', risk: 'high' }, { label: { en: 'Livelihood diversity', sw: 'Aina mbalimbali za vyanzo vya kipato' }, value: '40%', risk: 'medium' }, { label: { en: 'Savings/assets', sw: 'Akiba/mali' }, value: '25%', risk: 'high' } ],
      description: { en: 'Poor families cannot afford to evacuate, rebuild, or recover from disasters', sw: 'Familia maskini haziwezi kumudu kuhama, kujenga upya, au kurejea kutoka kwenye maafa' },
      tanzaniaNote: { en: 'Agricultural dependency increases drought sensitivity', sw: 'Utegemezi wa kilimo huongeza usikivu kwa ukame' } },
  ];
  s3ToggleFactor(f: any): void { this.s3Factor.set(this.s3Factor()?.id === f.id ? null : f); }
  s3FactorList(d: any): any[] { return [d.housing, d.health, d.infrastructure, d.economic]; }

  // ===== SECTION 4: Vulnerability =====
  s4Category = signal<'socioeconomic' | 'groups'>('socioeconomic');
  s4Group = signal<any | null>(null);
  s4ShowFormula = signal(false);
  readonly SOCIOECONOMIC_INDICATORS = [
    { id: 'poverty', category: { en: 'Poverty and Deprivation', sw: 'Umaskini na Unyimwaji' }, color: '#D32F2F',
      indicators: [ { name: { en: 'Below poverty line', sw: 'Chini ya mstari wa umaskini' }, value: { en: '26%', sw: '26%' }, severity: 'high' }, { name: { en: 'Asset ownership', sw: 'Umiliki wa mali' }, value: { en: '35%', sw: '35%' }, severity: 'medium' }, { name: { en: 'Income inequality (Gini)', sw: 'Tofauti ya kipato (Gini)' }, value: { en: '0.41', sw: '0.41' }, severity: 'high' } ],
      impact: { en: 'Poor families cannot afford evacuation, safe housing, or recovery costs', sw: 'Familia maskini haziwezi kumudu gharama za uhamishaji, makazi salama, au urejeshaji' } },
    { id: 'food', category: { en: 'Food Security', sw: 'Usalama wa Chakula' }, color: '#E65100',
      indicators: [ { name: { en: 'Child malnutrition (stunting)', sw: 'Utapiamlo wa watoto (udumavu)' }, value: { en: '31%', sw: '31%' }, severity: 'high' }, { name: { en: 'Food production index', sw: 'Kiashiria cha uzalishaji wa chakula' }, value: { en: '95', sw: '95' }, severity: 'medium' }, { name: { en: 'Drought-affected ag areas', sw: 'Maeneo ya kilimo yaliyoathiriwa na ukame' }, value: { en: '45%', sw: '45%' }, severity: 'high' } ],
      impact: { en: 'Malnourished populations are more likely to die during droughts and famines', sw: 'Watu wenye utapiamlo wana uwezekano mkubwa zaidi wa kufa wakati wa ukame na njaa' } },
    { id: 'health', category: { en: 'Health Systems', sw: 'Mifumo ya Afya' }, color: '#C2185B',
      indicators: [ { name: { en: 'Maternal mortality (per 100k)', sw: 'Vifo vya wajawazito (kwa 100k)' }, value: { en: '524', sw: '524' }, severity: 'high' }, { name: { en: 'Disease burden (DALYs)', sw: 'Mzigo wa magonjwa (DALYs)' }, value: { en: 'High', sw: 'Juu' }, severity: 'high' }, { name: { en: 'Access to healthcare', sw: 'Upatikanaji wa huduma za afya' }, value: { en: '55%', sw: '55%' }, severity: 'medium' } ],
      impact: { en: 'Weak health systems cannot handle epidemic outbreaks or mass casualties', sw: 'Mifumo dhaifu ya afya haiwezi kushughulikia milipuko ya magonjwa au majeruhi wengi' } },
    { id: 'education', category: { en: 'Education', sw: 'Elimu' }, color: '#7B1FA2',
      indicators: [ { name: { en: 'Adult literacy rate', sw: 'Kiwango cha kujua kusoma na kuandika kwa watu wazima' }, value: { en: '78%', sw: '78%' }, severity: 'medium' }, { name: { en: 'Primary school enrollment', sw: 'Uandikishaji wa shule ya msingi' }, value: { en: '85%', sw: '85%' }, severity: 'medium' }, { name: { en: 'Secondary completion', sw: 'Umaliziaji wa elimu ya sekondari' }, value: { en: '32%', sw: '32%' }, severity: 'high' } ],
      impact: { en: 'Low education limits understanding of warnings and disaster preparedness', sw: 'Elimu duni hupunguza uelewa wa maonyo na maandalizi ya maafa' } },
    { id: 'water', category: { en: 'Water and Sanitation', sw: 'Maji na Usafi wa Mazingira' }, color: '#1976D2',
      indicators: [ { name: { en: 'Access to clean water', sw: 'Upatikanaji wa maji safi' }, value: { en: '62%', sw: '62%' }, severity: 'medium' }, { name: { en: 'Improved sanitation', sw: 'Usafi wa mazingira ulioboreshwa' }, value: { en: '32%', sw: '32%' }, severity: 'high' }, { name: { en: 'Handwashing facilities', sw: 'Vifaa vya kunawa mikono' }, value: { en: '40%', sw: '40%' }, severity: 'high' } ],
      impact: { en: 'Poor WASH increases disease spread during floods and epidemics', sw: 'WASH duni huongeza kuenea kwa magonjwa wakati wa mafuriko na milipuko ya magonjwa' } },
  ];
  readonly VULNERABLE_GROUPS = [
    { id: 'children', name: { en: 'Children Under 5', sw: 'Watoto Chini ya Miaka 5' }, color: '#FF9800', population: { en: '15%', sw: '15%' }, count: { en: '9 million', sw: 'milioni 9' },
      whyVulnerable: [ { en: 'Physical weakness and dependency on adults', sw: 'Udhaifu wa kimwili na utegemezi kwa watu wazima' }, { en: 'Higher malnutrition rates (31% stunting)', sw: 'Viwango vya juu vya utapiamlo (udumavu 31%)' }, { en: 'More susceptible to diseases and dehydration', sw: 'Wako katika hatari zaidi ya magonjwa na upungufu wa maji mwilini' }, { en: 'Cannot evacuate independently', sw: 'Hawawezi kuhama wenyewe' } ],
      tanzaniaContext: { en: 'High birth rates maintain large under-5 population across all regions', sw: 'Viwango vya juu vya uzazi vinadumisha idadi kubwa ya watoto chini ya miaka 5 katika mikoa yote' } },
    { id: 'elderly', name: { en: 'Elderly (65+)', sw: 'Wazee (65+)' }, color: '#795548', population: { en: '4%', sw: '4%' }, count: { en: '2.4 million', sw: 'milioni 2.4' },
      whyVulnerable: [ { en: 'Mobility limitations during evacuations', sw: 'Vikwazo vya kutembea wakati wa uhamishaji' }, { en: 'Chronic health conditions worsen in crises', sw: 'Magonjwa sugu huzidi kuwa mabaya wakati wa majanga' }, { en: 'Limited income and savings for recovery', sw: 'Kipato na akiba ndogo kwa ajili ya urejeshaji' }, { en: 'Social isolation in rural areas', sw: 'Kutengwa kijamii katika maeneo ya vijijini' } ],
      tanzaniaContext: { en: 'Growing elderly population as life expectancy increases', sw: 'Idadi ya wazee inaongezeka kadiri matarajio ya umri wa kuishi yanavyoongezeka' } },
    { id: 'pwd', name: { en: 'Persons with Disabilities', sw: 'Watu Wenye Ulemavu' }, color: '#3F51B5', population: { en: '7%', sw: '7%' }, count: { en: '4.2 million', sw: 'milioni 4.2' },
      whyVulnerable: [ { en: 'Physical barriers to evacuation and shelters', sw: 'Vizuizi vya kimwili kwa uhamishaji na makazi ya hifadhi' }, { en: 'Limited access to warning information', sw: 'Upatikanaji mdogo wa taarifa za onyo' }, { en: 'Higher dependence on others for safety', sw: 'Utegemezi mkubwa kwa wengine kwa ajili ya usalama' }, { en: 'Often excluded from relief distribution', sw: 'Mara nyingi hutengwa katika ugawaji wa misaada' } ],
      tanzaniaContext: { en: 'Underreported; actual prevalence likely higher due to stigma', sw: 'Haijaripotiwa ipasavyo; kuenea halisi kuna uwezekano wa kuwa juu zaidi kutokana na unyanyapaa' } },
    { id: 'displaced', name: { en: 'Displaced Populations', sw: 'Watu Waliohamishwa Makazi' }, color: '#F44336', population: { en: 'Variable', sw: 'Hutofautiana' }, count: { en: '~500,000 (refugees + IDPs)', sw: '~500,000 (wakimbizi + waliohamishwa ndani)' },
      whyVulnerable: [ { en: 'Loss of assets and livelihoods', sw: 'Kupoteza mali na vyanzo vya kipato' }, { en: 'Living in temporary, hazard-prone areas', sw: 'Kuishi katika maeneo ya muda yenye janga' }, { en: 'Limited access to services', sw: 'Upatikanaji mdogo wa huduma' }, { en: 'Weak social networks for support', sw: 'Mitandao dhaifu ya kijamii ya msaada' } ],
      tanzaniaContext: { en: 'Hosts refugees from Burundi, DRC; internal displacement from floods/droughts', sw: 'Inahifadhi wakimbizi kutoka Burundi, DRC; uhamishaji wa ndani kutokana na mafuriko/ukame' } },
  ];
  s4ToggleGroup(g: any): void { this.s4Group.set(this.s4Group()?.id === g.id ? null : g); }

  // ===== SECTION 5: Coping =====
  s5Phase = signal<'all' | 'prepare' | 'respond' | 'recover'>('all');
  s5Component = signal<any | null>(null);
  s5ShowFormula = signal(false);
  s5ComparisonView = signal<'both' | 'high' | 'low'>('both');
  readonly COPING_PHASES = [
    { id: 'prepare', name: { en: 'PREPARE', sw: 'KUJIANDAA' }, color: '#1976D2', description: { en: 'Actions taken before a disaster to reduce impact', sw: 'Hatua zinazochukuliwa kabla ya maafa ili kupunguza athari' },
      activities: [ { en: 'Early warning systems', sw: 'Mifumo ya tahadhari za mapema' }, { en: 'Hazard mapping and planning', sw: 'Uchoraji ramani ya majanga na upangaji' }, { en: 'Community training and drills', sw: 'Mafunzo ya jamii na mazoezi' }, { en: 'Emergency supply stockpiling', sw: 'Uhifadhi wa vifaa vya dharura' }, { en: 'Building codes and land-use planning', sw: 'Kanuni za ujenzi na upangaji wa matumizi ya ardhi' } ] },
    { id: 'respond', name: { en: 'RESPOND', sw: 'KUITIKIA' }, color: '#D32F2F', description: { en: 'Actions during and immediately after a disaster', sw: 'Hatua wakati wa na mara tu baada ya maafa' },
      activities: [ { en: 'Emergency services deployment', sw: 'Upelekaji wa huduma za dharura' }, { en: 'Search and rescue operations', sw: 'Operesheni za utafutaji na uokoaji' }, { en: 'Medical response and triage', sw: 'Mwitikio wa kitabibu na upangaji wa vipaumbele vya matibabu' }, { en: 'Relief distribution (food, water, shelter)', sw: 'Ugawaji wa misaada (chakula, maji, makazi)' }, { en: 'Coordination and communication', sw: 'Uratibu na mawasiliano' } ] },
    { id: 'recover', name: { en: 'RECOVER', sw: 'KUREJESHA' }, color: '#43A047', description: { en: 'Actions to rebuild and strengthen after a disaster', sw: 'Hatua za kujenga upya na kuimarisha baada ya maafa' },
      activities: [ { en: 'Reconstruction of infrastructure', sw: 'Ujenzi upya wa miundombinu' }, { en: 'Livelihood restoration', sw: 'Urejeshaji wa vyanzo vya kipato' }, { en: 'Psychosocial support', sw: 'Msaada wa kisaikolojia na kijamii' }, { en: 'Learning from the disaster', sw: 'Kujifunza kutokana na maafa' }, { en: '"Build back better" improvements', sw: 'Maboresho ya "kujenga upya bora zaidi"' } ] },
  ];
  readonly PHASE_TABS = [ { id: 'all', label: { en: 'All Phases', sw: 'Hatua Zote' } }, { id: 'prepare', label: { en: 'Prepare', sw: 'Kujiandaa' } }, { id: 'respond', label: { en: 'Respond', sw: 'Kuitikia' } }, { id: 'recover', label: { en: 'Recover', sw: 'Kurejesha' } } ];
  readonly CAPACITY_COMPONENTS = [
    { id: 'institutional', name: { en: 'Institutional Capacity', sw: 'Uwezo wa Kitaasisi' }, color: '#3F51B5', description: { en: 'Government systems and disaster management structures', sw: 'Mifumo ya serikali na miundo ya usimamizi wa maafa' },
      indicators: [ { name: { en: 'National DRM Authority (PMO-DMD)', sw: 'Mamlaka ya Kitaifa ya Usimamizi wa Maafa (OWM-DMD)' }, status: { en: 'exists', sw: 'ipo' }, level: 'good' }, { name: { en: 'District Disaster Committees', sw: 'Kamati za Maafa za Wilaya' }, status: { en: '154 districts', sw: 'Wilaya 154' }, level: 'medium' }, { name: { en: 'DRR budget allocation', sw: 'Mgao wa bajeti ya kupunguza hatari za maafa' }, status: { en: '0.8% of budget', sw: '0.8% ya bajeti' }, level: 'low' }, { name: { en: 'Emergency response SOPs', sw: 'Taratibu za mwitikio wa dharura (SOPs)' }, status: { en: 'Partial', sw: 'Sehemu' }, level: 'medium' } ],
      tanzaniaNote: { en: 'Strong frameworks exist but funding and implementation gaps persist', sw: 'Mifumo imara ipo lakini mapengo ya ufadhili na utekelezaji yanaendelea kuwepo' } },
    { id: 'infrastructure', name: { en: 'Infrastructure', sw: 'Miundombinu' }, color: '#FF9800', description: { en: 'Physical systems for communication, transport, and services', sw: 'Mifumo ya kimwili kwa mawasiliano, usafiri, na huduma' },
      indicators: [ { name: { en: 'Early warning system coverage', sw: 'Wigo wa mfumo wa tahadhari za mapema' }, status: { en: '45% of at-risk areas', sw: '45% ya maeneo yaliyo hatarini' }, level: 'medium' }, { name: { en: 'All-season road access', sw: 'Upatikanaji wa barabara za kila majira' }, status: { en: '55% of districts', sw: '55% ya wilaya' }, level: 'medium' }, { name: { en: 'Mobile network coverage', sw: 'Wigo wa mtandao wa simu' }, status: { en: '85% population', sw: '85% ya watu' }, level: 'good' }, { name: { en: 'Emergency shelters', sw: 'Makazi ya hifadhi ya dharura' }, status: { en: '120 facilities', sw: 'Vituo 120' }, level: 'low' } ],
      tanzaniaNote: { en: 'Urban areas well-covered; rural and remote areas face significant gaps', sw: 'Maeneo ya mijini yamefikiwa vizuri; maeneo ya vijijini na ya pembezoni yanakabiliwa na mapengo makubwa' } },
    { id: 'health', name: { en: 'Health Services', sw: 'Huduma za Afya' }, color: '#E91E63', description: { en: 'Medical capacity to handle mass casualties and epidemics', sw: 'Uwezo wa kitabibu wa kushughulikia majeruhi wengi na milipuko ya magonjwa' },
      indicators: [ { name: { en: 'Hospitals per 100k people', sw: 'Hospitali kwa watu 100k' }, status: { en: '2.5', sw: '2.5' }, level: 'low' }, { name: { en: 'Ambulance availability', sw: 'Upatikanaji wa gari la wagonjwa' }, status: { en: '1 per 50k people', sw: '1 kwa watu 50k' }, level: 'low' }, { name: { en: 'Blood bank capacity', sw: 'Uwezo wa benki ya damu' }, status: { en: '60% of need', sw: '60% ya mahitaji' }, level: 'medium' }, { name: { en: 'Disease surveillance system', sw: 'Mfumo wa ufuatiliaji wa magonjwa' }, status: { en: 'Active', sw: 'Unafanya kazi' }, level: 'good' } ],
      tanzaniaNote: { en: 'Surveillance strong, but physical capacity (beds, equipment) is limited', sw: 'Ufuatiliaji ni imara, lakini uwezo wa kimwili (vitanda, vifaa) ni mdogo' } },
  ];
  readonly COMPARISON_SCENARIOS: any = {
    high: { title: { en: 'District with HIGH Coping Capacity', sw: 'Wilaya yenye Uwezo MKUBWA wa Kukabili' }, color: '#43A047',
      examples: [
        { hazard: { en: 'Flood (100mm rainfall)', sw: 'Mafuriko (mvua ya milimita 100)' }, outcome: { en: 'Managed Situation', sw: 'Hali Iliyoimudika' }, details: [ { en: 'Early warning issued 24h in advance', sw: 'Tahadhari ya mapema ilitolewa saa 24 kabla' }, { en: 'Pre-positioned supplies distributed', sw: 'Vifaa vilivyowekwa mapema viligawanywa' }, { en: 'Vulnerable populations evacuated to shelters', sw: 'Watu walio katika uathirikaji walihamishiwa makazi ya hifadhi' }, { en: 'Minor damage, no deaths, quick recovery', sw: 'Uharibifu mdogo, hakuna vifo, urejeshaji wa haraka' } ] },
        { hazard: { en: 'Disease Outbreak', sw: 'Mlipuko wa Ugonjwa' }, outcome: { en: 'Controlled Response', sw: 'Mwitikio Uliodhibitiwa' }, details: [ { en: 'Surveillance detected outbreak early', sw: 'Ufuatiliaji uligundua mlipuko mapema' }, { en: 'Isolation facilities activated', sw: 'Vituo vya kutenga vilianzishwa' }, { en: 'Medical teams deployed within hours', sw: 'Timu za kitabibu zilipelekwa ndani ya masaa machache' }, { en: 'Outbreak contained in 2 weeks', sw: 'Mlipuko ulidhibitiwa ndani ya wiki 2' } ] },
      ] },
    low: { title: { en: 'District with LOW Coping Capacity', sw: 'Wilaya yenye Uwezo MDOGO wa Kukabili' }, color: '#D32F2F',
      examples: [
        { hazard: { en: 'Flood (100mm rainfall)', sw: 'Mafuriko (mvua ya milimita 100)' }, outcome: { en: 'CRISIS', sw: 'JANGA' }, details: [ { en: 'No warning system - people caught off guard', sw: 'Hakuna mfumo wa onyo - watu walishtukiwa' }, { en: 'No evacuation plan or shelters', sw: 'Hakuna mpango wa uhamishaji wala makazi ya hifadhi' }, { en: 'Roads cut off, no emergency access', sw: 'Barabara zilikatika, hakuna njia ya dharura' }, { en: 'Major damage, deaths, prolonged displacement', sw: 'Uharibifu mkubwa, vifo, uhamishaji wa muda mrefu' } ] },
        { hazard: { en: 'Disease Outbreak', sw: 'Mlipuko wa Ugonjwa' }, outcome: { en: 'CRISIS', sw: 'JANGA' }, details: [ { en: 'Outbreak detected after widespread transmission', sw: 'Mlipuko uligunduliwa baada ya kuenea kwa wingi' }, { en: 'No isolation capacity or treatment supplies', sw: 'Hakuna uwezo wa kutenga wala vifaa vya matibabu' }, { en: 'Medical staff overwhelmed', sw: 'Wahudumu wa afya walielemewa' }, { en: 'High mortality, prolonged epidemic', sw: 'Vifo vingi, mlipuko wa muda mrefu' } ] },
      ] },
  };
  readonly COMPARISON_VIEWS = [ { id: 'both', label: { en: 'Compare Both', sw: 'Linganisha Vyote' } }, { id: 'high', label: { en: 'High Capacity', sw: 'Uwezo Mkubwa' } }, { id: 'low', label: { en: 'Low Capacity', sw: 'Uwezo Mdogo' } } ];
  s5VisiblePhases = computed(() => this.s5Phase() === 'all' ? this.COPING_PHASES : this.COPING_PHASES.filter(p => p.id === this.s5Phase()));
  s5ToggleComponent(c: any): void { this.s5Component.set(this.s5Component()?.id === c.id ? null : c); }

  // ===== SECTION 6: Risk =====
  s6ShowCompleteFormula = signal(false);
  s6Comparison = signal<'regional' | 'dimensional'>('regional');
  s6HE = signal(3.8);
  s6V = signal(5.1);
  s6LCC = signal(3.9);
  readonly TANZANIA_RISK = {
    overall: 4.2, classification: { en: 'Medium-High Risk', sw: 'Hatari ya Wastani-Juu' }, classificationColor: '#FF9800',
    dimensions: { hazardExposure: 3.8, vulnerability: 5.1, lackCoping: 3.9 },
    rank: { en: '78 out of 191 countries', sw: '78 kati ya nchi 191' },
    context: { en: 'Tanzania faces medium-high disaster risk due to elevated vulnerability despite moderate hazard exposure', sw: 'Tanzania inakabiliwa na hatari ya maafa ya wastani-juu kutokana na uathirikaji ulioongezeka licha ya uwazi wa janga wa wastani' },
  };
  readonly RISK_LEVELS = [
    { key: 'verylow', level: { en: 'Very Low', sw: 'Chini Sana' }, range: '0.0 - 2.0', color: '#4CAF50', description: { en: 'Minimal disaster risk', sw: 'Hatari ndogo sana ya maafa' } },
    { key: 'low', level: { en: 'Low', sw: 'Chini' }, range: '2.0 - 3.5', color: '#8BC34A', description: { en: 'Limited disaster risk', sw: 'Hatari ndogo ya maafa' } },
    { key: 'medium', level: { en: 'Medium', sw: 'Wastani' }, range: '3.5 - 5.0', color: '#FFC107', description: { en: 'Moderate disaster risk', sw: 'Hatari ya wastani ya maafa' } },
    { key: 'high', level: { en: 'High', sw: 'Juu' }, range: '5.0 - 6.5', color: '#FF9800', description: { en: 'Significant disaster risk', sw: 'Hatari kubwa ya maafa' } },
    { key: 'veryhigh', level: { en: 'Very High', sw: 'Juu Sana' }, range: '6.5 - 10.0', color: '#D32F2F', description: { en: 'Severe disaster risk', sw: 'Hatari kali ya maafa' } },
  ];
  readonly REGIONAL_COMPARISONS = [
    { key: 'tz', region: { en: 'Tanzania', sw: 'Tanzania' }, score: 4.2, color: '#FF9800' },
    { key: 'ea', region: { en: 'East Africa Average', sw: 'Wastani wa Afrika Mashariki' }, score: 4.8, color: '#FF5722' },
    { key: 'sa', region: { en: 'Southern Africa Average', sw: 'Wastani wa Kusini mwa Afrika' }, score: 3.6, color: '#FFC107' },
    { key: 'global', region: { en: 'Global Average', sw: 'Wastani wa Kidunia' }, score: 3.9, color: '#9E9E9E' },
  ];
  readonly DIMENSION_COMPARISONS = [
    { key: 'he', dimension: { en: 'Hazard and Exposure', sw: 'Janga na Uwazi' }, tanzania: 3.8, eastAfrica: 4.1, global: 3.5, color: '#D32F2F' },
    { key: 'v', dimension: { en: 'Vulnerability', sw: 'Uathirikaji' }, tanzania: 5.1, eastAfrica: 5.5, global: 4.2, color: '#E65100' },
    { key: 'lcc', dimension: { en: 'Lack of Coping Capacity', sw: 'Ukosefu wa Uwezo wa Kukabili' }, tanzania: 3.9, eastAfrica: 4.6, global: 3.8, color: '#1976D2' },
  ];
  scenarioRisk = computed(() => Math.pow(this.s6HE() * this.s6V() * this.s6LCC(), 1 / 3).toFixed(2));
  scenarioLevel = computed(() => {
    const n = parseFloat(this.scenarioRisk());
    if (n < 2.0) return this.RISK_LEVELS[0];
    if (n < 3.5) return this.RISK_LEVELS[1];
    if (n < 5.0) return this.RISK_LEVELS[2];
    if (n < 6.5) return this.RISK_LEVELS[3];
    return this.RISK_LEVELS[4];
  });
  onSlider(which: 'he' | 'v' | 'lcc', e: Event): void {
    const v = parseFloat((e.target as HTMLInputElement).value);
    if (which === 'he') this.s6HE.set(v); else if (which === 'v') this.s6V.set(v); else this.s6LCC.set(v);
  }
  s6Preset(he: number, v: number, lcc: number): void { this.s6HE.set(he); this.s6V.set(v); this.s6LCC.set(lcc); }
  pct(n: number): string { return `${(n / 10) * 100}%`; }

  // ===== Template-chrome translations (component-local i18n table) =====
  // Bilingual UI strings for headings, paragraphs, labels, buttons, and quiz chrome. Data content
  // (datasets/quiz objects) carries its own { en, sw } fields resolved via tx(); this table covers
  // everything authored directly in the template.
  private TR: Record<string, TxEntry> = TR_TABLE;
}

/** A bilingual string: English plus its Kiswahili counterpart. */
type TxEntry = { en: string; sw: string };

/** Component-local translation table for template-chrome strings (resolved by `t(key)`). */
const TR_TABLE: Record<string, TxEntry> = {
  // ---- shared / global chrome ----
  back_to_education: { en: 'Back to Education', sw: 'Rudi Elimu' },
  course_eyebrow: { en: 'INFORM Framework · Guided Course', sw: 'Mfumo wa INFORM · Kozi Inayoongozwa' },
  course_title: { en: 'Understanding Risk for Decision-Making in Tanzania', sw: 'Kuelewa Hatari kwa Ufanyaji Maamuzi nchini Tanzania' },
  section_word: { en: 'Section', sw: 'Sehemu' },
  of_six: { en: 'of 6', sw: 'kati ya 6' },
  completed_word: { en: 'completed', sw: 'zimekamilika' },
  previous: { en: 'Previous', sw: 'Iliyotangulia' },
  next: { en: 'Next', sw: 'Endelea' },
  take_quiz: { en: 'Take Quiz', sw: 'Fanya Jaribio' },
  continue_to_risk_module: { en: 'Continue to INFORM Risk Module', sw: 'Endelea kwenye Moduli ya Hatari ya INFORM' },
  notice_strong: { en: 'INFORM is a decision-support tool', sw: 'INFORM ni zana ya kusaidia ufanyaji maamuzi' },
  notice_rest1: { en: 'for humanitarian and development actors.', sw: 'kwa wadau wa kibinadamu na maendeleo.' },
  notice_rest2: { en: 'It requires proper training to interpret correctly. This module provides essential conceptual foundation.', sw: 'Inahitaji mafunzo sahihi ili kuitafsiri kwa usahihi. Moduli hii inatoa msingi muhimu wa kidhana.' },

  // ---- quiz chrome ----
  quiz_word: { en: 'Quiz', sw: 'Jaribio' },
  quiz_select_submit: { en: 'Select the best answer and click Submit', sw: 'Chagua jibu bora kisha bofya Wasilisha' },
  quiz_correct_proceed: { en: 'Correct! You may proceed to the next section.', sw: 'Sahihi! Unaweza kuendelea kwenye sehemu inayofuata.' },
  quiz_incorrect_review: { en: 'Incorrect. Please review the explanation and try again.', sw: 'Si Sahihi. Tafadhali pitia maelezo kisha jaribu tena.' },
  correct_word: { en: 'Correct!', sw: 'Sahihi!' },
  incorrect_word: { en: 'Incorrect', sw: 'Si Sahihi' },
  submit_answer: { en: 'Submit Answer', sw: 'Wasilisha Jibu' },
  continue_next_section: { en: 'Continue to Next Section', sw: 'Endelea kwenye Sehemu Inayofuata' },
  review_section_retry: { en: 'Review Section and Retry', sw: 'Pitia Sehemu na Ujaribu Tena' },

  // ---- shared definition / prefixes ----
  inform_definition_label: { en: 'INFORM Definition', sw: 'Ufafanuzi wa INFORM' },
  inform_definition_prefix: { en: 'INFORM Definition:', sw: 'Ufafanuzi wa INFORM:' },
  scientific_definition_prefix: { en: 'Scientific Definition:', sw: 'Ufafanuzi wa Kisayansi:' },
  inform_note_prefix: { en: 'INFORM Note:', sw: 'Dokezo la INFORM:' },
  definition_prefix: { en: 'Definition:', sw: 'Ufafanuzi:' },
  example_em: { en: 'Example:', sw: 'Mfano:' },
  example_word: { en: 'Example:', sw: 'Mfano:' },
  why_matters_prefix: { en: 'Why it matters:', sw: 'Kwa nini ni muhimu:' },
  important_word: { en: 'Important:', sw: 'Muhimu:' },
  note_word: { en: 'Note:', sw: 'Dokezo:' },
  tanzania_prefix: { en: 'Tanzania:', sw: 'Tanzania:' },
  tanzania_context_prefix: { en: 'Tanzania Context:', sw: 'Muktadha wa Tanzania:' },
  critical_point_prefix: { en: 'Critical Point:', sw: 'Hoja Muhimu:' },
  key_insight_prefix: { en: 'Key Insight:', sw: 'Ufahamu Muhimu:' },
  insight_prefix: { en: 'Insight:', sw: 'Ufahamu:' },
  key_finding_prefix: { en: 'Key Finding:', sw: 'Ugunduzi Muhimu:' },
  problem_prefix: { en: 'Problem:', sw: 'Tatizo:' },
  benefit_prefix: { en: 'Benefit:', sw: 'Faida:' },
  bottom_line_prefix: { en: 'Bottom Line:', sw: 'Hitimisho:' },
  what_this_means_prefix: { en: 'What This Means:', sw: 'Maana Yake:' },
  what_this_means: { en: 'What This Means:', sw: 'Maana Yake:' },
  next_section_label: { en: 'Next Section:', sw: 'Sehemu Inayofuata:' },
  frequency_label: { en: 'Frequency:', sw: 'Mara kwa Mara:' },
  category_label: { en: 'Category:', sw: 'Kundi:' },
  typical_frequency_label: { en: 'Typical Frequency:', sw: 'Mara kwa Mara ya Kawaida:' },
  status_label: { en: 'Status:', sw: 'Hali:' },

  // ---- glossary words reused across sections ----
  hazard_word: { en: 'Hazard', sw: 'Janga' },
  exposure_word: { en: 'Exposure', sw: 'Uwazi' },
  vulnerability_word: { en: 'Vulnerability', sw: 'Uathirikaji' },
  vulnerability_word_caps: { en: 'VULNERABILITY', sw: 'UATHIRIKAJI' },
  coping_capacity_word: { en: 'Coping Capacity', sw: 'Uwezo wa Kukabili' },
  hazard_exposure_word: { en: 'Hazard and Exposure', sw: 'Janga na Uwazi' },
  lcc_long_word: { en: 'Lack of Coping Capacity', sw: 'Ukosefu wa Uwezo wa Kukabili' },
  and_word: { en: 'and', sw: 'na' },
  drought_word: { en: 'Drought', sw: 'Ukame' },
  flood_word: { en: 'Flood', sw: 'Mafuriko' },
  epidemic_word: { en: 'Epidemic', sw: 'Mlipuko wa Ugonjwa' },
  floods_word: { en: 'Floods', sw: 'Mafuriko' },
  epidemics_word: { en: 'Epidemics', sw: 'Milipuko ya Magonjwa' },
  cyclones_word: { en: 'Cyclones', sw: 'Vimbunga' },
  risk_eq_lhs: { en: 'Risk', sw: 'Hatari' },
  risk_suffix: { en: 'Risk', sw: 'Hatari' },

  // ---- SECTION 1 ----
  s1_number: { en: 'SECTION 1 OF 6', sw: 'SEHEMU 1 KATI YA 6' },
  s1_title: { en: 'HAZARD: What Can Happen?', sw: 'JANGA: Nini Kinaweza Kutokea?' },
  s1_intro: { en: "Understanding what hazards are and why they don't automatically cause disasters", sw: 'Kuelewa majanga ni nini na kwa nini hayasababishi maafa moja kwa moja' },
  s1_def_h: { en: 'What is a Hazard?', sw: 'Janga ni Nini?' },
  s1_def_p1: { en: 'A hazard is a potentially damaging physical or human-induced event.', sw: 'Janga ni tukio la kimwili au lililosababishwa na binadamu lenye uwezekano wa kuleta uharibifu.' },
  s1_def_p2: { en: 'Hazards are natural or human processes that may cause loss of life, injury, property damage, social and economic disruption, or environmental degradation.', sw: 'Majanga ni michakato ya asili au ya kibinadamu inayoweza kusababisha vifo, majeruhi, uharibifu wa mali, mtikisiko wa kijamii na kiuchumi, au uharibifu wa mazingira.' },
  s1_critical_lesson: { en: 'CRITICAL LESSON', sw: 'SOMO MUHIMU' },
  s1_hazard_and_disaster: { en: 'HAZARD and DISASTER', sw: 'JANGA na MAAFA' },
  s1_becomes_when: { en: 'A hazard becomes a disaster only when:', sw: 'Janga linakuwa maafa pale tu:' },
  s1_li1_b: { en: 'People are exposed', sw: 'Watu wamo wazi' },
  s1_li1_r: { en: '(living in hazard zones)', sw: '(wanaoishi katika maeneo ya janga)' },
  s1_li2_b: { en: 'Communities are vulnerable', sw: 'Jamii ziko katika uathirikaji' },
  s1_li2_r: { en: '(poor housing, health, resources)', sw: '(makazi duni, afya, rasilimali)' },
  s1_li3_b: { en: 'Response capacity is inadequate', sw: 'Uwezo wa mwitikio hautoshelezi' },
  s1_li3_r: { en: '(weak early warning, emergency services)', sw: '(tahadhari dhaifu za mapema, huduma za dharura)' },
  s1_example_a: { en: 'A flood in an uninhabited forest has', sw: 'Mafuriko katika msitu usio na watu yana' },
  s1_example_b: { en: 'zero humanitarian risk', sw: 'hatari sifuri ya kibinadamu' },
  s1_example_c: { en: 'The same flood in a densely populated area with poor drainage becomes a disaster.', sw: 'Mafuriko yale yale katika eneo lenye watu wengi na mfumo duni wa kupitisha maji huwa maafa.' },
  s1_hazards_in_tz: { en: 'Hazards in Tanzania', sw: 'Majanga nchini Tanzania' },
  s1_hazards_in_tz_intro: { en: 'Tanzania faces multiple types of hazards. Understanding each type helps in planning and preparedness.', sw: 'Tanzania inakabiliwa na aina nyingi za majanga. Kuelewa kila aina husaidia katika upangaji na maandalizi.' },
  s1_no_impact_a: { en: 'At this stage, we are only identifying', sw: 'Katika hatua hii, tunatambua tu' },
  s1_no_impact_b: { en: 'what can happen', sw: 'nini kinaweza kutokea' },
  s1_no_impact_c: { en: 'We have NOT mentioned population, impact, or disaster yet.', sw: 'HATUJATAJA bado idadi ya watu, athari, au maafa.' },
  s1_no_impact_d: { en: 'This teaches: "Events exist, but they don\'t automatically cause crises"', sw: 'Hii inafundisha: "Matukio yapo, lakini hayasababishi majanga moja kwa moja"' },
  s1_timeline_h: { en: 'Major Hazard Events in Tanzania (Last 10 Years)', sw: 'Matukio Makuu ya Majanga nchini Tanzania (Miaka 10 Iliyopita)' },
  s1_timeline_intro: { en: 'Historical frequency helps us understand hazard patterns, but does NOT predict impact.', sw: 'Historia ya mara kwa mara hutusaidia kuelewa mifumo ya majanga, lakini HAITABIRI athari.' },
  s1_timeline_note: { en: 'This is a simplified representation. Actual hazard monitoring data would show precise dates, intensities, and affected locations.', sw: 'Hii ni picha iliyorahisishwa. Takwimu halisi za ufuatiliaji wa majanga zingeonyesha tarehe kamili, ukali, na maeneo yaliyoathirika.' },
  s1_summary_h: { en: 'Section 1 Summary: What You Learned', sw: 'Muhtasari wa Sehemu 1: Ulichojifunza' },
  s1_sum_li1: { en: 'Hazards are potentially damaging events (natural or human)', sw: 'Majanga ni matukio yenye uwezekano wa kuleta uharibifu (ya asili au ya kibinadamu)' },
  s1_sum_li2: { en: 'Tanzania faces multiple hazard types with varying frequencies', sw: 'Tanzania inakabiliwa na aina nyingi za majanga zenye mara kwa mara tofauti' },
  s1_sum_li3: { en: 'Hazards alone do NOT create disasters', sw: 'Majanga peke yake HAYASABABISHI maafa' },
  s1_sum_li4: { en: 'Impact depends on exposure, vulnerability, and coping capacity (coming next!)', sw: 'Athari hutegemea uwazi, uathirikaji, na uwezo wa kukabili (yanafuata!)' },
  s1_next_preview: { en: 'EXPOSURE - Where hazards meet people', sw: 'UWAZI - Mahali majanga yanapokutana na watu' },

  // ---- SECTION 2 ----
  s2_title: { en: 'Section 2: Exposure', sw: 'Sehemu 2: Uwazi' },
  s2_subtitle: { en: 'Where Hazards Meet People', sw: 'Mahali Majanga Yanapokutana na Watu' },
  s2_def_h: { en: 'What is Exposure?', sw: 'Uwazi ni Nini?' },
  s2_def_p1: { en: 'Exposure is the presence of people, infrastructure, or livelihoods in hazard-prone areas.', sw: 'Uwazi ni uwepo wa watu, miundombinu, au vyanzo vya kipato katika maeneo yenye janga.' },
  s2_def_p2a: { en: 'A hazard only creates risk when people, buildings, or economic activities are located where the hazard can occur.', sw: 'Janga huleta hatari pale tu watu, majengo, au shughuli za kiuchumi vinapokuwa mahali ambapo janga linaweza kutokea.' },
  s2_def_p2b: { en: 'Exposure answers: "Who or what is in harm\'s way?"', sw: 'Uwazi hujibu: "Nani au nini yumo hatarini?"' },
  s2_overlay_h: { en: 'The Overlay Concept', sw: 'Dhana ya Mwingiliano' },
  s2_overlay_intro: { en: 'Exposure is created when hazard zones and population overlap. Think of it as layering two maps on top of each other:', sw: 'Uwazi hutokea pale maeneo ya janga na idadi ya watu vinapoingiliana. Fikiria kama kuweka ramani mbili moja juu ya nyingine:' },
  s2_layer_hazard: { en: 'Hazard Zone', sw: 'Eneo la Janga' },
  s2_layer_population: { en: 'Population', sw: 'Idadi ya Watu' },
  s2_layer_exposure: { en: 'Exposure (Overlap)', sw: 'Uwazi (Mwingiliano)' },
  s2_overlay_formula: { en: 'Hazard Zone + Population = Exposure', sw: 'Eneo la Janga + Idadi ya Watu = Uwazi' },
  s2_two_ways_h: { en: 'Two Ways to Measure Exposure', sw: 'Njia Mbili za Kupima Uwazi' },
  s2_absolute_h: { en: 'Absolute Exposure', sw: 'Uwazi Kamili' },
  s2_absolute_def: { en: 'The total number of people in hazard zones', sw: 'Jumla ya idadi ya watu katika maeneo ya janga' },
  s2_absolute_ex: { en: "1,200,000 people live in Dar es Salaam's flood zone", sw: 'Watu 1,200,000 wanaishi katika eneo la mafuriko la Dar es Salaam' },
  s2_absolute_why: { en: 'Shows the scale of potential impact', sw: 'Huonyesha ukubwa wa athari inayoweza kutokea' },
  s2_relative_h: { en: 'Relative Exposure', sw: 'Uwazi Linganishi' },
  s2_relative_def: { en: 'The percentage of population in hazard zones', sw: 'Asilimia ya idadi ya watu katika maeneo ya janga' },
  s2_relative_ex: { en: "65% of Dar es Salaam's population lives in the flood zone", sw: 'Asilimia 65 ya wakazi wa Dar es Salaam wanaishi katika eneo la mafuriko' },
  s2_relative_why: { en: 'Shows the proportion of the community at risk', sw: 'Huonyesha uwiano wa jamii iliyo hatarini' },
  s2_both_metrics_b: { en: 'INFORM uses both metrics', sw: 'INFORM hutumia vipimo vyote viwili' },
  s2_both_metrics_r: { en: 'to avoid bias toward large or small populations. A small district with 100% exposure needs as much attention as a large city with lower percentage.', sw: 'ili kuepuka upendeleo kwa idadi kubwa au ndogo za watu. Wilaya ndogo yenye uwazi wa 100% inahitaji uangalizi sawa na jiji kubwa lenye asilimia ndogo.' },
  s2_data_h: { en: 'Exposure in Tanzania: Real Data', sw: 'Uwazi nchini Tanzania: Takwimu Halisi' },
  s2_data_intro: { en: 'Select a district below to see how many people live in hazard-prone areas:', sw: 'Chagua wilaya hapa chini kuona ni watu wangapi wanaoishi katika maeneo yenye janga:' },
  s2_people_in_zone: { en: 'People in Hazard Zone', sw: 'Watu Katika Eneo la Janga' },
  s2_exposed_word: { en: 'Exposed', sw: 'Wazi' },
  s2_detailed_exposure: { en: 'Detailed Exposure', sw: 'Uwazi kwa Kina' },
  s2_zone_area: { en: 'Hazard Zone Area', sw: 'Eneo la Janga' },
  s2_pop_in_zone_abs: { en: 'Population in Zone (Absolute)', sw: 'Idadi ya Watu Katika Eneo (Kamili)' },
  s2_total_district_pop: { en: 'Total District Population', sw: 'Jumla ya Idadi ya Watu wa Wilaya' },
  s2_exposure_rate_rel: { en: 'Exposure Rate (Relative)', sw: 'Kiwango cha Uwazi (Linganishi)' },
  s2_hazard_context_prefix: { en: 'Hazard Context:', sw: 'Muktadha wa Janga:' },
  s2_challenge_h: { en: "Tanzania's Exposure Challenge", sw: 'Changamoto ya Uwazi ya Tanzania' },
  s2_formula_part1: { en: 'Moderate to High Hazards', sw: 'Majanga ya Wastani hadi Juu' },
  s2_formula_part2: { en: 'High Population Exposure', sw: 'Uwazi Mkubwa wa Idadi ya Watu' },
  s2_formula_result: { en: 'Significant Potential Impact', sw: 'Athari Kubwa Inayoweza Kutokea' },
  s2_challenge_ex_h: { en: 'Example: Dar es Salaam', sw: 'Mfano: Dar es Salaam' },
  s2_challenge_li1: { en: 'Moderate flood hazard (coastal + riverine)', sw: 'Janga la wastani la mafuriko (la pwani + la mito)' },
  s2_challenge_li2: { en: '65% of population in flood zone (1.2 million people)', sw: 'Asilimia 65 ya watu katika eneo la mafuriko (watu milioni 1.2)' },
  s2_challenge_li3: { en: 'Result: Very high flood exposure', sw: 'Matokeo: Uwazi wa juu sana wa mafuriko' },
  s2_challenge_note: { en: 'Even moderate hazards create significant risk when large populations are exposed. This is why location planning and early warning systems are crucial for Tanzania.', sw: 'Hata majanga ya wastani huleta hatari kubwa pale idadi kubwa za watu zinapokuwa wazi. Ndiyo maana upangaji wa maeneo na mifumo ya tahadhari za mapema ni muhimu kwa Tanzania.' },
  s2_notice_h: { en: 'Still Learning Concepts - No Impact Assessment Yet', sw: 'Bado Tunajifunza Dhana - Hakuna Tathmini ya Athari Bado' },
  s2_notice_p: { en: "We've now covered Hazard (what can happen) and Exposure (who is in harm's way). But we still haven't mentioned:", sw: 'Sasa tumeshughulikia Janga (nini kinaweza kutokea) na Uwazi (nani yumo hatarini). Lakini bado hatujataja:' },
  s2_notice_li1_b: { en: 'Vulnerability', sw: 'Uathirikaji' },
  s2_notice_li1_r: { en: '(why some suffer more)', sw: '(kwa nini wengine huathirika zaidi)' },
  s2_notice_li2_b: { en: 'Impact severity', sw: 'Ukali wa athari' },
  s2_notice_li2_r: { en: '(how bad it gets)', sw: '(jinsi inavyokuwa mbaya)' },
  s2_notice_li3_b: { en: 'Risk calculation', sw: 'Hesabu ya hatari' },
  s2_notice_li3_r: { en: '(combining all factors)', sw: '(kuunganisha vipengele vyote)' },
  s2_notice_emph_b: { en: "Being exposed doesn't automatically mean disaster.", sw: 'Kuwa wazi hakumaanishi maafa moja kwa moja.' },
  s2_notice_emph_r: { en: 'The next sections will show why some exposed populations are more vulnerable than others.', sw: 'Sehemu zinazofuata zitaonyesha kwa nini baadhi ya watu walio wazi wako katika uathirikaji zaidi kuliko wengine.' },
  s2_summary_h: { en: 'Section 2 Summary: Key Learnings', sw: 'Muhtasari wa Sehemu 2: Mafunzo Muhimu' },
  s2_sum_li1_b: { en: 'Exposure', sw: 'Uwazi' },
  s2_sum_li1_r: { en: 'is created when people live or work in hazard-prone areas', sw: 'hutokea pale watu wanapoishi au kufanya kazi katika maeneo yenye janga' },
  s2_sum_li2_a: { en: 'We measure exposure in two ways:', sw: 'Tunapima uwazi kwa njia mbili:' },
  s2_sum_li2_b1: { en: 'absolute', sw: 'kamili' },
  s2_sum_li2_m: { en: '(total people) and', sw: '(jumla ya watu) na' },
  s2_sum_li2_b2: { en: 'relative', sw: 'linganishi' },
  s2_sum_li2_end: { en: '(percentage)', sw: '(asilimia)' },
  s2_sum_li3_a: { en: 'Tanzania has', sw: 'Tanzania ina' },
  s2_sum_li3_b: { en: 'high exposure', sw: 'uwazi mkubwa' },
  s2_sum_li3_r: { en: 'in many districts due to population concentration in hazard zones', sw: 'katika wilaya nyingi kutokana na msongamano wa watu katika maeneo ya janga' },
  s2_sum_li4_b: { en: 'Location matters', sw: 'Mahali pana umuhimu' },
  s2_sum_li4_r: { en: '- the same hazard affects different numbers of people depending on where they live', sw: '- janga lile lile huathiri idadi tofauti za watu kutegemea wanapoishi' },
  s2_next_h: { en: 'Next Section: Sensitivity', sw: 'Sehemu Inayofuata: Usikivu' },
  s2_next_p1: { en: 'We know', sw: 'Tunajua' },
  s2_next_em1: { en: 'what hazards exist', sw: 'majanga gani yapo' },
  s2_next_p2: { en: 'and', sw: 'na' },
  s2_next_em2: { en: 'who is exposed', sw: 'nani yuko wazi' },
  s2_next_p3: { en: 'But why do the same hazards cause different levels of impact? Section 3 explores', sw: 'Lakini kwa nini majanga yale yale husababisha viwango tofauti vya athari? Sehemu 3 inachunguza' },
  s2_next_b: { en: 'sensitivity', sw: 'usikivu' },
  s2_next_p4: { en: '- how strongly people are affected when hazards occur.', sw: '- jinsi watu wanavyoathirika kwa nguvu pale majanga yanapotokea.' },

  // ---- SECTION 3 ----
  s3_title: { en: 'Section 3: Sensitivity', sw: 'Sehemu 3: Usikivu' },
  s3_subtitle: { en: 'How Severely People Are Affected', sw: 'Jinsi Watu Wanavyoathirika Kwa Ukali' },
  s3_def_h: { en: 'What is Sensitivity?', sw: 'Usikivu ni Nini?' },
  s3_def_p1: { en: 'Sensitivity is how strongly exposed people are affected when a hazard occurs.', sw: 'Usikivu ni jinsi watu walio wazi wanavyoathirika kwa nguvu pale janga linapotokea.' },
  s3_def_p2a: { en: 'Two communities can face the', sw: 'Jamii mbili zinaweza kukabiliwa na' },
  s3_def_p2b: { en: 'same hazard', sw: 'janga lile lile' },
  s3_def_p2c: { en: 'with the', sw: 'lenye' },
  s3_def_p2d: { en: 'same exposure', sw: 'uwazi sawa' },
  s3_def_p2e: { en: 'but experience', sw: 'lakini kupata' },
  s3_def_p2f: { en: 'vastly different impacts', sw: 'athari tofauti kabisa' },
  s3_def_p2g: { en: 'Sensitivity explains why some communities suffer more than others.', sw: 'Usikivu unaeleza kwa nini baadhi ya jamii huathirika zaidi kuliko nyingine.' },
  s3_inform_note: { en: 'INFORM embeds sensitivity within the Vulnerability dimension (socio-economic factors + vulnerable groups). We teach it separately for clarity.', sw: 'INFORM huingiza usikivu ndani ya kipimo cha Uathirikaji (vipengele vya kijamii na kiuchumi + makundi yaliyo katika uathirikaji). Tunafundisha kivyake kwa ufafanuzi.' },
  s3_compare_h: { en: 'Same Hazard, Different Outcomes', sw: 'Janga Lile Lile, Matokeo Tofauti' },
  s3_compare_intro_a: { en: 'Let\'s compare two districts that experienced the', sw: 'Tulinganishe wilaya mbili zilizopata' },
  s3_compare_intro_b: { en: 'exact same flood', sw: 'mafuriko yale yale kabisa' },
  s3_compare_intro_c: { en: 'but had', sw: 'lakini zikawa na' },
  s3_compare_intro_d: { en: 'very different results:', sw: 'matokeo tofauti kabisa:' },
  s3_btn_districtA: { en: 'District A (High Sensitivity)', sw: 'Wilaya A (Usikivu wa Juu)' },
  compare_both: { en: 'Compare Both', sw: 'Linganisha Vyote' },
  s3_btn_districtB: { en: 'District B (Low Sensitivity)', sw: 'Wilaya B (Usikivu wa Chini)' },
  s3_same_flood_prefix: { en: 'Same Flood:', sw: 'Mafuriko Yale Yale:' },
  s3_factors_h: { en: 'Sensitivity Factors in Tanzania', sw: 'Vipengele vya Usikivu nchini Tanzania' },
  s3_factors_intro: { en: 'These are the key factors that determine how severely Tanzanian communities are affected by hazards:', sw: 'Hivi ni vipengele vikuu vinavyoamua jinsi jamii za Kitanzania zinavyoathirika kwa ukali na majanga:' },
  s3_insight_h: { en: 'CRITICAL INSIGHT: "Disasters Are Not Natural"', sw: 'UFAHAMU MUHIMU: "Maafa Si ya Asili"' },
  s3_insight_emph_b: { en: 'Natural hazards are inevitable.', sw: 'Majanga ya asili hayaepukiki.' },
  s3_insight_emph_r: { en: 'Floods, droughts, and cyclones will always occur.', sw: 'Mafuriko, ukame, na vimbunga vitatokea kila wakati.' },
  s3_insight_main_a: { en: 'But', sw: 'Lakini' },
  s3_insight_main_b: { en: 'DISASTERS', sw: 'MAAFA' },
  s3_insight_main_c: { en: '- the death, displacement, and suffering - are', sw: '- vifo, uhamishaji, na mateso - ni' },
  s3_insight_main_d: { en: 'NOT natural', sw: 'SI ya asili' },
  s3_insight_main_e: { en: 'They are created by:', sw: 'Yanasababishwa na:' },
  s3_cause1_b: { en: 'Poverty', sw: 'Umaskini' },
  s3_cause1_p: { en: 'Inability to build safe homes or evacuate', sw: 'Kushindwa kujenga nyumba salama au kuhama' },
  s3_cause2_b: { en: 'Poor Infrastructure', sw: 'Miundombinu Duni' },
  s3_cause2_p: { en: 'Weak housing, no drainage, bad roads', sw: 'Makazi dhaifu, hakuna mfumo wa kupitisha maji, barabara mbovu' },
  s3_cause3_b: { en: 'Weak Health Systems', sw: 'Mifumo Dhaifu ya Afya' },
  s3_cause3_p: { en: 'Malnutrition, disease, limited healthcare', sw: 'Utapiamlo, magonjwa, huduma ndogo za afya' },
  s3_cause4_b: { en: 'Inequality', sw: 'Ukosefu wa Usawa' },
  s3_cause4_p: { en: 'Marginalized groups suffer disproportionately', sw: 'Makundi yaliyotengwa huathirika kupita kiasi' },
  s3_concl_b: { en: 'Reducing sensitivity reduces disaster impact', sw: 'Kupunguza usikivu hupunguza athari za maafa' },
  s3_concl_p_a: { en: 'This is why development matters. Improving housing, health, infrastructure, and equality', sw: 'Ndiyo maana maendeleo yana umuhimu. Kuboresha makazi, afya, miundombinu, na usawa' },
  s3_concl_p_b: { en: 'saves lives during hazards', sw: 'huokoa maisha wakati wa majanga' },
  s3_summary_h: { en: 'Section 3 Summary: Key Learnings', sw: 'Muhtasari wa Sehemu 3: Mafunzo Muhimu' },
  s3_sum_li1_b: { en: 'Sensitivity', sw: 'Usikivu' },
  s3_sum_li1_r: { en: 'determines how severely people are affected when hazards occur', sw: 'huamua jinsi watu wanavyoathirika kwa ukali pale majanga yanapotokea' },
  s3_sum_li2_a: { en: 'The', sw: '' },
  s3_sum_li2_b1: { en: 'same hazard', sw: 'Janga lile lile' },
  s3_sum_li2_m1: { en: 'can cause a', sw: 'linaweza kusababisha' },
  s3_sum_li2_b2: { en: 'disaster', sw: 'maafa' },
  s3_sum_li2_m2: { en: 'in one place and be', sw: 'mahali pamoja na kuwa' },
  s3_sum_li2_b3: { en: 'manageable', sw: 'inayoweza kuimudika' },
  s3_sum_li2_end: { en: 'in another - sensitivity makes the difference', sw: 'mahali pengine - usikivu huleta tofauti' },
  s3_sum_li3_a: { en: 'Key sensitivity factors:', sw: 'Vipengele vikuu vya usikivu:' },
  s3_sum_li3_b: { en: 'housing quality, health status, infrastructure, economic status', sw: 'ubora wa makazi, hali ya afya, miundombinu, hali ya kiuchumi' },
  s3_sum_li4_b: { en: 'Disasters are NOT natural', sw: 'Maafa SI ya asili' },
  s3_sum_li4_r: { en: "- they're created by poverty, inequality, and weak systems", sw: '- yanasababishwa na umaskini, ukosefu wa usawa, na mifumo dhaifu' },
  s3_next_h: { en: 'Next Section: Vulnerability', sw: 'Sehemu Inayofuata: Uathirikaji' },
  s3_next_p_a: { en: "We've learned how sensitivity affects impact. Now we'll explore", sw: 'Tumejifunza jinsi usikivu unavyoathiri athari. Sasa tutachunguza' },
  s3_next_p_b: { en: 'vulnerability', sw: 'uathirikaji' },
  s3_next_p_c: { en: '- the broader concept that INFORM uses to assess which communities are most at risk. This is where we\'ll start to see the', sw: '- dhana pana ambayo INFORM huitumia kutathmini ni jamii zipi ziko hatarini zaidi. Hapa ndipo tutaanza kuona' },
  s3_next_p_d: { en: 'INFORM formula', sw: 'fomula ya INFORM' },
  s3_next_p_e: { en: 'taking shape.', sw: 'ikianza kuchukua sura.' },

  // ---- SECTION 4 ----
  s4_title: { en: 'Section 4: Vulnerability', sw: 'Sehemu 4: Uathirikaji' },
  s4_subtitle: { en: 'Why Some Communities Suffer More', sw: 'Kwa Nini Baadhi ya Jamii Huathirika Zaidi' },
  s4_def_h: { en: 'What is Vulnerability?', sw: 'Uathirikaji ni Nini?' },
  s4_def_p1: { en: 'Vulnerability is the susceptibility of communities to hazards - how likely they are to suffer harm when a hazard occurs.', sw: 'Uathirikaji ni hali ya jamii kuwa katika hatari ya majanga - uwezekano wao wa kupata madhara pale janga linapotokea.' },
  s4_def_p2a: { en: 'Vulnerability is NOT created by disasters - it', sw: 'Uathirikaji HAUSABABISHWI na maafa - ' },
  s4_def_p2b: { en: 'exists before disasters happen', sw: 'upo kabla ya maafa kutokea' },
  s4_def_p2c: { en: "It's made up of pre-existing conditions like poverty, weak health, and marginalized populations.", sw: 'Umejengwa na hali zilizopo tayari kama umaskini, afya dhaifu, na watu waliotengwa.' },
  s4_emph: { en: 'Vulnerability is a root cause, not a consequence. It determines who suffers most when hazards strike.', sw: 'Uathirikaji ni chanzo cha msingi, si tokeo. Huamua nani anaathirika zaidi pale majanga yanapotokea.' },
  s4_components_h: { en: "INFORM's Two Components of Vulnerability", sw: 'Vijenzi Viwili vya Uathirikaji vya INFORM' },
  s4_components_intro: { en: 'INFORM measures vulnerability through two complementary dimensions:', sw: 'INFORM hupima uathirikaji kupitia vipimo viwili vinavyokamilishana:' },
  s4_comp1_b: { en: '1. Socio-Economic Vulnerability', sw: '1. Uathirikaji wa Kijamii na Kiuchumi' },
  s4_comp1_p: { en: 'Development, poverty, health, education', sw: 'Maendeleo, umaskini, afya, elimu' },
  s4_comp2_b: { en: '2. Vulnerable Groups', sw: '2. Makundi Yaliyo Katika Uathirikaji' },
  s4_comp2_p: { en: 'Children, elderly, PWDs, displaced', sw: 'Watoto, wazee, watu wenye ulemavu, waliohamishwa' },
  s4_socio_h: { en: 'Socio-Economic Vulnerability in Tanzania', sw: 'Uathirikaji wa Kijamii na Kiuchumi nchini Tanzania' },
  s4_socio_intro: { en: 'These pre-existing development gaps make communities more susceptible to disasters:', sw: 'Mapengo haya ya maendeleo yaliyopo tayari hufanya jamii kuwa katika hatari zaidi ya maafa:' },
  s4_groups_h: { en: 'Vulnerable Groups in Tanzania', sw: 'Makundi Yaliyo Katika Uathirikaji nchini Tanzania' },
  s4_groups_intro: { en: 'These population segments face disproportionate harm during disasters:', sw: 'Makundi haya ya watu hukabiliwa na madhara yasiyo sawia wakati wa maafa:' },
  s4_of_population: { en: 'of population', sw: 'ya idadi ya watu' },
  s4_why_vulnerable: { en: 'Why Vulnerable:', sw: 'Kwa Nini Wako Katika Uathirikaji:' },
  s4_reveal_h: { en: 'Introducing the INFORM Risk Equation', sw: 'Kutambulisha Mlinganyo wa Hatari wa INFORM' },
  s4_reveal_p_a: { en: "You've now learned about", sw: 'Sasa umejifunza kuhusu' },
  s4_reveal_p_b: { en: "It's time to see how INFORM combines these into a mathematical framework for measuring risk.", sw: 'Ni wakati wa kuona jinsi INFORM inavyounganisha hivi katika mfumo wa kihisabati wa kupima hatari.' },
  s4_formula_revealed: { en: 'Formula Revealed', sw: 'Fomula Imefunuliwa' },
  s4_formula_reveal_btn: { en: 'Click to Reveal INFORM Formula', sw: 'Bofya Kufunua Fomula ya INFORM' },
  s4_formula_title: { en: 'INFORM RISK EQUATION (1 of 3 Dimensions Revealed)', sw: 'MLINGANYO WA HATARI WA INFORM (Kipimo 1 kati ya 3 Kimefunuliwa)' },
  s4_exp1_b: { en: 'V = Vulnerability', sw: 'V = Uathirikaji' },
  s4_exp1_p: { en: 'Combines socio-economic vulnerability + vulnerable groups', sw: 'Huunganisha uathirikaji wa kijamii na kiuchumi + makundi yaliyo katika uathirikaji' },
  s4_exp2_b: { en: 'Pre-Existing', sw: 'Uliopo Tayari' },
  s4_exp2_p: { en: 'Vulnerability exists BEFORE disasters occur', sw: 'Uathirikaji upo KABLA ya maafa kutokea' },
  s4_exp3_b: { en: 'Reducible', sw: 'Unaweza Kupunguzwa' },
  s4_exp3_p: { en: 'Reducing V reduces future risk - this is prevention!', sw: 'Kupunguza V hupunguza hatari ya baadaye - hii ni kinga!' },
  s4_exp4_b: { en: 'Development Reduces Risk', sw: 'Maendeleo Hupunguza Hatari' },
  s4_exp4_p: { en: 'Better health, education, housing = Lower vulnerability = Lower risk', sw: 'Afya bora, elimu, makazi = Uathirikaji mdogo = Hatari ndogo' },
  s4_formula_note_a: { en: "We'll reveal the other dimensions (H and E and LCC) in the next sections. For now, understand that", sw: 'Tutafunua vipimo vingine (H na E na LCC) katika sehemu zinazofuata. Kwa sasa, elewa kwamba' },
  s4_formula_note_b: { en: 'Vulnerability is an equal pillar of risk', sw: 'Uathirikaji ni nguzo sawa ya hatari' },
  s4_preexist_h: { en: 'KEY EMPHASIS: Vulnerability Is Pre-Existing', sw: 'MSISITIZO MUHIMU: Uathirikaji Upo Tayari' },
  s4_emph1_b: { en: 'Exists Before Disasters', sw: 'Upo Kabla ya Maafa' },
  s4_emph1_p: { en: 'Vulnerability is present in communities long before hazards strike', sw: 'Uathirikaji upo katika jamii muda mrefu kabla majanga hayajatokea' },
  s4_emph2_b: { en: 'Can Be Measured', sw: 'Unaweza Kupimwa' },
  s4_emph2_p: { en: 'We can quantify vulnerability using indicators like poverty, health, and education', sw: 'Tunaweza kukadiria uathirikaji kwa kutumia viashiria kama umaskini, afya, na elimu' },
  s4_emph3_b: { en: 'Can Be Reduced', sw: 'Unaweza Kupunguzwa' },
  s4_emph3_p: { en: 'Development interventions lower vulnerability and prevent future disasters', sw: 'Hatua za maendeleo hupunguza uathirikaji na kuzuia maafa ya baadaye' },
  s4_emph4_b: { en: 'Reduction = Prevention', sw: 'Upunguzaji = Kinga' },
  s4_emph4_p: { en: 'Every improvement in vulnerability is a reduction in future disaster risk', sw: 'Kila uboreshaji wa uathirikaji ni upunguzaji wa hatari ya maafa ya baadaye' },
  s4_tz_example_h: { en: 'Example: Tanzania', sw: 'Mfano: Tanzania' },
  s4_tz_li1_b: { en: 'Improving nutrition', sw: 'Kuboresha lishe' },
  s4_tz_li1_r: { en: 'Lower vulnerability to droughts', sw: 'Uathirikaji mdogo kwa ukame' },
  s4_tz_li2_b: { en: 'Better housing', sw: 'Makazi bora' },
  s4_tz_li2_r: { en: 'Lower vulnerability to floods and landslides', sw: 'Uathirikaji mdogo kwa mafuriko na maporomoko ya ardhi' },
  s4_tz_li3_b: { en: 'Stronger health systems', sw: 'Mifumo imara zaidi ya afya' },
  s4_tz_li3_r: { en: 'Lower vulnerability to epidemics', sw: 'Uathirikaji mdogo kwa milipuko ya magonjwa' },
  s4_tz_li4_b: { en: 'Education programs', sw: 'Programu za elimu' },
  s4_tz_li4_r: { en: 'Better understanding of warnings and risks', sw: 'Uelewa bora wa maonyo na hatari' },
  s4_summary_h: { en: 'Section 4 Summary: Key Learnings', sw: 'Muhtasari wa Sehemu 4: Mafunzo Muhimu' },
  s4_sum_li1_b: { en: 'Vulnerability', sw: 'Uathirikaji' },
  s4_sum_li1_r: { en: 'is the susceptibility of communities to hazards - it determines who suffers most', sw: 'ni hali ya jamii kuwa katika hatari ya majanga - huamua nani anaathirika zaidi' },
  s4_sum_li2_a: { en: 'INFORM measures vulnerability through', sw: 'INFORM hupima uathirikaji kupitia' },
  s4_sum_li2_b: { en: 'two components', sw: 'vijenzi viwili' },
  s4_sum_li2_r: { en: ': socio-economic factors and vulnerable groups', sw: ': vipengele vya kijamii na kiuchumi na makundi yaliyo katika uathirikaji' },
  s4_sum_li3_a: { en: 'Vulnerability', sw: 'Uathirikaji' },
  s4_sum_li3_b: { en: 'exists before disasters', sw: 'upo kabla ya maafa' },
  s4_sum_li3_r: { en: "- it's a root cause, not a consequence", sw: '- ni chanzo cha msingi, si tokeo' },
  s4_sum_li4_a: { en: 'The', sw: '' },
  s4_sum_li4_b: { en: 'INFORM formula', sw: 'Fomula ya INFORM' },
  s4_sum_li4_r: { en: 'uses Vulnerability as one of three equal dimensions of risk', sw: 'hutumia Uathirikaji kama mojawapo ya vipimo vitatu sawa vya hatari' },
  s4_sum_li5_b: { en: 'Reducing vulnerability = Prevention', sw: 'Kupunguza uathirikaji = Kinga' },
  s4_sum_li5_r: { en: '- development saves lives', sw: '- maendeleo huokoa maisha' },
  s4_next_h: { en: 'Next Section: Coping Capacity', sw: 'Sehemu Inayofuata: Uwezo wa Kukabili' },
  s4_next_p_a: { en: "We've seen how vulnerability increases risk. But what about a community's ability to manage disasters? Section 5 introduces", sw: 'Tumeona jinsi uathirikaji unavyoongeza hatari. Lakini je, uwezo wa jamii wa kusimamia maafa? Sehemu 5 inatambulisha' },
  s4_next_p_b: { en: '- the other side of the coin. Strong coping capacity can counterbalance vulnerability and reduce risk, even in highly exposed areas.', sw: '- upande mwingine wa sarafu. Uwezo imara wa kukabili unaweza kusawazisha uathirikaji na kupunguza hatari, hata katika maeneo yaliyo wazi sana.' },

  // ---- SECTION 5 ----
  s5_title: { en: 'Section 5: Coping Capacity', sw: 'Sehemu 5: Uwezo wa Kukabili' },
  s5_subtitle: { en: 'Ability to Prepare, Respond, and Recover', sw: 'Uwezo wa Kujiandaa, Kuitikia, na Kurejesha' },
  s5_def_h: { en: 'What is Coping Capacity?', sw: 'Uwezo wa Kukabili ni Nini?' },
  s5_def_p1: { en: 'Coping capacity is the ability of systems, institutions, and communities to reduce disaster impact through preparedness, response, and recovery.', sw: 'Uwezo wa kukabili ni uwezo wa mifumo, taasisi, na jamii wa kupunguza athari za maafa kupitia maandalizi, mwitikio, na urejeshaji.' },
  s5_def_p2b: { en: 'Coping capacity counterbalances vulnerability.', sw: 'Uwezo wa kukabili husawazisha uathirikaji.' },
  s5_def_p2r: { en: 'Even highly exposed and vulnerable populations may avoid crisis if coping capacity is strong. This is why investing in disaster management systems, infrastructure, and health services saves lives.', sw: 'Hata watu walio wazi sana na walio katika uathirikaji wanaweza kuepuka janga ikiwa uwezo wa kukabili ni imara. Ndiyo maana kuwekeza katika mifumo ya usimamizi wa maafa, miundombinu, na huduma za afya huokoa maisha.' },
  s5_lcc_note_b: { en: 'INFORM uses "Lack of Coping Capacity" (LCC):', sw: 'INFORM hutumia "Ukosefu wa Uwezo wa Kukabili" (LCC):' },
  s5_lcc_note_r: { en: 'Strong capacity = Low LCC = Lower risk', sw: 'Uwezo imara = LCC ndogo = Hatari ndogo' },
  s5_framework_h: { en: 'The Coping Capacity Framework', sw: 'Mfumo wa Uwezo wa Kukabili' },
  s5_framework_intro: { en: 'Coping capacity works across three phases of the disaster cycle:', sw: 'Uwezo wa kukabili hufanya kazi katika hatua tatu za mzunguko wa maafa:' },
  s5_key_activities: { en: 'Key Activities:', sw: 'Shughuli Muhimu:' },
  s5_components_h: { en: "Tanzania's Coping Capacity: Three Components", sw: 'Uwezo wa Kukabili wa Tanzania: Vijenzi Vitatu' },
  s5_components_intro: { en: 'INFORM measures coping capacity through these three dimensions:', sw: 'INFORM hupima uwezo wa kukabili kupitia vipimo hivi vitatu:' },
  s5_capacity_diff_h: { en: 'Capacity Makes the Difference', sw: 'Uwezo Huleta Tofauti' },
  s5_capacity_diff_b: { en: 'Same hazard, same exposure, same vulnerability', sw: 'Janga lile lile, uwazi sawa, uathirikaji sawa' },
  s5_capacity_diff_m: { en: '- but', sw: '- lakini' },
  s5_capacity_diff_b2: { en: 'different coping capacity', sw: 'uwezo tofauti wa kukabili' },
  s5_capacity_diff_end: { en: 'leads to vastly different outcomes:', sw: 'husababisha matokeo tofauti kabisa:' },
  s5_reveal_h: { en: 'INFORM Formula: Second Dimension', sw: 'Fomula ya INFORM: Kipimo cha Pili' },
  s5_reveal_p_a: { en: "You've seen how", sw: 'Umeona jinsi' },
  s5_reveal_p_b: { en: 'increases risk. Now see how', sw: 'unavyoongeza hatari. Sasa ona jinsi' },
  s5_reveal_p_c: { en: 'works alongside it in the INFORM equation.', sw: 'unavyofanya kazi pamoja nao katika mlinganyo wa INFORM.' },
  s5_second_revealed: { en: 'Second Dimension Revealed', sw: 'Kipimo cha Pili Kimefunuliwa' },
  s5_reveal_second_btn: { en: 'Reveal Second Dimension', sw: 'Funua Kipimo cha Pili' },
  s5_formula_title: { en: 'INFORM RISK EQUATION (2 of 3 Dimensions Revealed)', sw: 'MLINGANYO WA HATARI WA INFORM (Vipimo 2 kati ya 3 Vimefunuliwa)' },
  s5_pill_v: { en: 'V = Vulnerability', sw: 'V = Uathirikaji' },
  s5_pill_lcc: { en: 'LCC = Lack of Coping Capacity', sw: 'LCC = Ukosefu wa Uwezo wa Kukabili' },
  s5_exp1_b: { en: 'LCC = "Lack" of Capacity', sw: 'LCC = "Ukosefu" wa Uwezo' },
  s5_exp1_p: { en: 'INFORM uses the inverse: Strong capacity = Low LCC', sw: 'INFORM hutumia kinyume: Uwezo imara = LCC ndogo' },
  s5_exp2_b: { en: 'Counterbalances Vulnerability', sw: 'Husawazisha Uathirikaji' },
  s5_exp2_p: { en: 'High capacity can offset high vulnerability', sw: 'Uwezo mkubwa unaweza kufidia uathirikaji mkubwa' },
  s5_exp3_b: { en: 'Can Be Strengthened', sw: 'Unaweza Kuimarishwa' },
  s5_exp3_p: { en: 'Investment in systems and infrastructure reduces LCC and risk', sw: 'Uwekezaji katika mifumo na miundombinu hupunguza LCC na hatari' },
  s5_exp4_b: { en: 'Determines Crisis vs Management', sw: 'Huamua Janga dhidi ya Usimamizi' },
  s5_exp4_p: { en: 'Capacity decides if a hazard overwhelms the country', sw: 'Uwezo huamua kama janga litaielemea nchi' },
  s5_formula_note_b: { en: 'One more dimension to go!', sw: 'Kimebaki kipimo kimoja tu!' },
  s5_formula_note_r: { en: 'Section 6 will reveal (H and E) - Hazard and Exposure - completing the full INFORM Risk equation.', sw: 'Sehemu 6 itafunua (H na E) - Janga na Uwazi - ikikamilisha mlinganyo kamili wa Hatari wa INFORM.' },
  s5_counter_h: { en: 'KEY INSIGHT: Coping Capacity Counterbalances Vulnerability', sw: 'UFAHAMU MUHIMU: Uwezo wa Kukabili Husawazisha Uathirikaji' },
  s5_scenario_title: { en: 'Scenario: High Vulnerability District', sw: 'Hali: Wilaya Yenye Uathirikaji Mkubwa' },
  s5_without_h: { en: 'WITHOUT Strong Coping Capacity:', sw: 'BILA Uwezo Imara wa Kukabili:' },
  s5_with_h: { en: 'WITH Strong Coping Capacity:', sw: 'PAMOJA na Uwezo Imara wa Kukabili:' },
  s5_w_famine: { en: 'Famine', sw: 'Njaa Kali' },
  s5_w_massdeaths: { en: 'Mass Deaths', sw: 'Vifo Vingi' },
  s5_w_displacement: { en: 'Displacement', sw: 'Uhamishaji' },
  s5_y_food: { en: 'Managed food distribution', sw: 'Ugawaji wa chakula uliodhibitiwa' },
  s5_y_outbreak: { en: 'Controlled outbreak', sw: 'Mlipuko uliodhibitiwa' },
  s5_y_evac: { en: 'Safe evacuation', sw: 'Uhamishaji salama' },
  s5_concl_b: { en: 'Investing in capacity = Risk reduction', sw: 'Kuwekeza katika uwezo = Upunguzaji wa hatari' },
  s5_concl_p: { en: "This is why Tanzania's investments in early warning systems, emergency services, and health infrastructure directly reduce disaster risk.", sw: 'Ndiyo maana uwekezaji wa Tanzania katika mifumo ya tahadhari za mapema, huduma za dharura, na miundombinu ya afya hupunguza hatari ya maafa moja kwa moja.' },
  s5_summary_h: { en: 'Section 5 Summary: Key Learnings', sw: 'Muhtasari wa Sehemu 5: Mafunzo Muhimu' },
  s5_sum_li1_b: { en: 'Coping capacity', sw: 'Uwezo wa kukabili' },
  s5_sum_li1_r: { en: 'is the ability to prepare, respond, and recover from disasters', sw: 'ni uwezo wa kujiandaa, kuitikia, na kurejea kutoka kwenye maafa' },
  s5_sum_li2_a: { en: 'INFORM measures capacity through', sw: 'INFORM hupima uwezo kupitia' },
  s5_sum_li2_b: { en: 'three components', sw: 'vijenzi vitatu' },
  s5_sum_li2_r: { en: ': institutional, infrastructure, and health', sw: ': kitaasisi, miundombinu, na afya' },
  s5_sum_li3_b: { en: 'Strong capacity counterbalances vulnerability', sw: 'Uwezo imara husawazisha uathirikaji' },
  s5_sum_li3_r: { en: '- the same vulnerable population can avoid crisis with good coping systems', sw: '- watu wale wale walio katika uathirikaji wanaweza kuepuka janga kwa mifumo mizuri ya kukabili' },
  s5_sum_li4_a: { en: 'The INFORM formula uses', sw: 'Fomula ya INFORM hutumia' },
  s5_sum_li4_b: { en: 'Lack of Coping Capacity (LCC)', sw: 'Ukosefu wa Uwezo wa Kukabili (LCC)' },
  s5_sum_li4_r: { en: 'as the second dimension of risk', sw: 'kama kipimo cha pili cha hatari' },
  s5_sum_li5_b: { en: 'Investing in capacity = Risk reduction', sw: 'Kuwekeza katika uwezo = Upunguzaji wa hatari' },
  s5_sum_li5_r: { en: '- every improvement in systems and infrastructure saves lives', sw: '- kila uboreshaji wa mifumo na miundombinu huokoa maisha' },
  s5_next_h: { en: 'Final Section: Risk', sw: 'Sehemu ya Mwisho: Hatari' },
  s5_next_p_a: { en: "You've learned about Hazard and Exposure, Vulnerability, and Coping Capacity. Section 6 brings it all together - the", sw: 'Umejifunza kuhusu Janga na Uwazi, Uathirikaji, na Uwezo wa Kukabili. Sehemu 6 inaunganisha yote - ' },
  s5_next_p_b: { en: 'complete INFORM Risk formula', sw: 'fomula kamili ya Hatari ya INFORM' },
  s5_next_p_c: { en: ', how to calculate risk scores, and how Tanzania uses this framework for decision-making.', sw: ', jinsi ya kukokotoa alama za hatari, na jinsi Tanzania inavyotumia mfumo huu kwa ufanyaji maamuzi.' },

  // ---- SECTION 6 ----
  s6_title: { en: 'Section 6: Risk', sw: 'Sehemu 6: Hatari' },
  s6_subtitle: { en: 'Putting It All Together', sw: 'Kuunganisha Yote Pamoja' },
  s6_def_h: { en: 'What is Risk?', sw: 'Hatari ni Nini?' },
  s6_def_p1: { en: 'Risk is the combination of hazard, exposure, vulnerability, and lack of coping capacity. It represents the potential for humanitarian crises requiring international assistance.', sw: 'Hatari ni mchanganyiko wa janga, uwazi, uathirikaji, na ukosefu wa uwezo wa kukabili. Inawakilisha uwezekano wa majanga ya kibinadamu yanayohitaji msaada wa kimataifa.' },
  s6_def_p2a: { en: 'Risk is NOT random or unpredictable - it can be', sw: 'Hatari SI ya nasibu wala isiyotabirika - inaweza kuwa' },
  s6_def_p2b: { en: 'measured, compared, and reduced', sw: 'imepimwa, imelinganishwa, na imepunguzwa' },
  s6_def_p2c: { en: 'The INFORM Risk Index provides a scientific framework for understanding and addressing disaster risk.', sw: 'Kielelezo cha Hatari cha INFORM hutoa mfumo wa kisayansi wa kuelewa na kushughulikia hatari ya maafa.' },
  s6_emph: { en: 'Risk is calculable and manageable. By addressing its components (reducing vulnerability, strengthening coping capacity), we can prevent future disasters.', sw: 'Hatari inaweza kukokotolewa na kuimudika. Kwa kushughulikia vijenzi vyake (kupunguza uathirikaji, kuimarisha uwezo wa kukabili), tunaweza kuzuia maafa ya baadaye.' },
  s6_complete_h: { en: 'The Complete INFORM Risk Equation', sw: 'Mlinganyo Kamili wa Hatari wa INFORM' },
  s6_complete_p_a: { en: "You've learned about", sw: 'Umejifunza kuhusu' },
  s6_complete_p_b: { en: 'Now see how INFORM combines all three dimensions into a single, comparable risk score.', sw: 'Sasa ona jinsi INFORM inavyounganisha vipimo vyote vitatu katika alama moja ya hatari inayolinganishika.' },
  s6_complete_revealed: { en: 'Complete Formula Revealed', sw: 'Fomula Kamili Imefunuliwa' },
  s6_complete_reveal_btn: { en: 'Click to Reveal Complete INFORM Formula', sw: 'Bofya Kufunua Fomula Kamili ya INFORM' },
  s6_formula_title: { en: 'THE COMPLETE INFORM RISK EQUATION', sw: 'MLINGANYO KAMILI WA HATARI WA INFORM' },
  s6_hl_he: { en: 'HAZARD and EXPOSURE', sw: 'JANGA na UWAZI' },
  s6_hl_he_d: { en: 'What hazards + Who is exposed', sw: 'Majanga gani + Nani yuko wazi' },
  s6_hl_v_d: { en: 'Pre-existing susceptibility', sw: 'Hali ya uathirikaji iliyopo tayari' },
  s6_hl_lcc: { en: 'LACK OF COPING CAPACITY', sw: 'UKOSEFU WA UWEZO WA KUKABILI' },
  s6_hl_lcc_d: { en: 'Inability to manage disasters', sw: 'Kushindwa kusimamia maafa' },
  s6_geo_h: { en: 'Why the Geometric Mean (Cube Root)?', sw: 'Kwa Nini Wastani wa Kijiometri (Mzizi wa Tatu)?' },
  s6_arith_title: { en: 'Arithmetic Mean (Average)', sw: 'Wastani wa Kihesabu (Mean)' },
  s6_arith_problem: { en: 'High score in one dimension can be "cancelled out" by low scores in others', sw: 'Alama ya juu katika kipimo kimoja inaweza "kufutwa" na alama za chini katika vingine' },
  s6_arith_example: { en: 'Example: H and E=9, V=1, LCC=1 → Risk = 3.7 (appears moderate, but high hazard!)', sw: 'Mfano: H na E=9, V=1, LCC=1 → Hatari = 3.7 (inaonekana wastani, lakini janga ni kubwa!)' },
  s6_geo_title: { en: 'Geometric Mean (Cube Root)', sw: 'Wastani wa Kijiometri (Mzizi wa Tatu)' },
  s6_geo_benefit: { en: 'ALL dimensions matter equally - a high score in any dimension raises overall risk', sw: 'Vipimo VYOTE vina umuhimu sawa - alama ya juu katika kipimo chochote huongeza hatari ya jumla' },
  s6_geo_example: { en: 'Same example: H and E=9, V=1, LCC=1 → Risk = 2.1 (low, accurately reflects low V and LCC)', sw: 'Mfano ule ule: H na E=9, V=1, LCC=1 → Hatari = 2.1 (chini, inaakisi kwa usahihi V na LCC ndogo)' },
  s6_geo_insight: { en: 'The geometric mean ensures that reducing risk requires addressing ALL dimensions. You cannot have low risk if vulnerability is high, even if coping capacity is strong.', sw: 'Wastani wa kijiometri huhakikisha kuwa kupunguza hatari kunahitaji kushughulikia vipimo VYOTE. Huwezi kuwa na hatari ndogo ikiwa uathirikaji ni mkubwa, hata kama uwezo wa kukabili ni imara.' },
  s6_tz_score_h: { en: "Tanzania's INFORM Risk Score", sw: 'Alama ya Hatari ya INFORM ya Tanzania' },
  s6_tz_score_intro: { en: "Based on the INFORM methodology, here is Tanzania's current disaster risk profile:", sw: 'Kwa kuzingatia mbinu ya INFORM, hii ndiyo wasifu wa sasa wa hatari ya maafa wa Tanzania:' },
  s6_tz_score_label: { en: 'Tanzania INFORM Risk Score', sw: 'Alama ya Hatari ya INFORM ya Tanzania' },
  s6_dim_breakdown: { en: 'Dimension Breakdown', sw: 'Mchanganuo wa Vipimo' },
  s6_classification_h: { en: 'INFORM Risk Classification', sw: 'Uainishaji wa Hatari wa INFORM' },
  s6_classification_intro: { en: 'INFORM scores range from 0 (no risk) to 10 (maximum risk), divided into five levels:', sw: 'Alama za INFORM huanzia 0 (hakuna hatari) hadi 10 (hatari ya juu kabisa), zikigawanywa katika viwango vitano:' },
  s6_tz_is_here: { en: 'Tanzania is here', sw: 'Tanzania iko hapa' },
  s6_compare_h: { en: 'How Does Tanzania Compare?', sw: 'Tanzania Inalinganaje?' },
  s6_tab_regional: { en: 'Regional Comparison', sw: 'Ulinganishi wa Kikanda' },
  s6_tab_dimensional: { en: 'Dimension Comparison', sw: 'Ulinganishi wa Vipimo' },
  s6_regional_insight: { en: "Tanzania's risk (4.2) is below the East Africa average (4.8) but above the Southern Africa and global averages. This reflects moderate hazard exposure but elevated vulnerability relative to coping capacity.", sw: 'Hatari ya Tanzania (4.2) iko chini ya wastani wa Afrika Mashariki (4.8) lakini juu ya wastani wa Kusini mwa Afrika na wa kidunia. Hii inaakisi uwazi wa wastani wa janga lakini uathirikaji ulioongezeka ukilinganishwa na uwezo wa kukabili.' },
  s6_row_tanzania: { en: 'Tanzania:', sw: 'Tanzania:' },
  s6_row_eastafrica: { en: 'East Africa:', sw: 'Afrika Mashariki:' },
  s6_row_global: { en: 'Global:', sw: 'Kidunia:' },
  s6_dimensional_insight: { en: "Tanzania's vulnerability (5.1) is the highest dimension, exceeding both regional and global averages. This indicates that addressing socio-economic factors and vulnerable populations should be a priority for risk reduction.", sw: 'Uathirikaji wa Tanzania (5.1) ndicho kipimo cha juu zaidi, kikizidi wastani wa kikanda na wa kidunia. Hii inaonyesha kuwa kushughulikia vipengele vya kijamii na kiuchumi na watu walio katika uathirikaji kunapaswa kuwa kipaumbele kwa upunguzaji wa hatari.' },
  s6_scenario_h: { en: 'Scenario Analysis: "What If?"', sw: 'Uchambuzi wa Hali: "Itakuwaje Ikiwa?"' },
  s6_scenario_intro: { en: "Explore how changes to each dimension affect overall risk. Adjust the sliders to see how interventions in different areas could reduce Tanzania's risk score.", sw: 'Chunguza jinsi mabadiliko katika kila kipimo yanavyoathiri hatari ya jumla. Rekebisha vitelezi kuona jinsi hatua katika maeneo tofauti zinavyoweza kupunguza alama ya hatari ya Tanzania.' },
  s6_try_scenarios: { en: 'Try These Scenarios:', sw: 'Jaribu Hali Hizi:' },
  s6_preset1: { en: 'Reduce Vulnerability', sw: 'Punguza Uathirikaji' },
  s6_preset2: { en: 'Strengthen Coping', sw: 'Imarisha Uwezo wa Kukabili' },
  s6_preset3: { en: 'Combined Interventions', sw: 'Hatua Zilizounganishwa' },
  s6_preset3_hint: { en: '(V and LCC both reduced)', sw: '(V na LCC vyote vimepunguzwa)' },
  s6_preset_reset: { en: 'Reset to Tanzania Current', sw: 'Rejesha kwa Hali ya Sasa ya Tanzania' },
  s6_manageable_h: { en: 'KEY EMPHASIS: Risk is MANAGEABLE, Not Fixed', sw: 'MSISITIZO MUHIMU: Hatari INAWEZA KUIMUDIKA, Si ya Kudumu' },
  s6_mng1_b: { en: 'Risk is Measurable', sw: 'Hatari Inapimika' },
  s6_mng1_p: { en: 'The INFORM formula provides a scientific, comparable way to quantify disaster risk', sw: 'Fomula ya INFORM hutoa njia ya kisayansi, inayolinganishika ya kukadiria hatari ya maafa' },
  s6_mng2_b: { en: 'Risk is Transparent', sw: 'Hatari ni Wazi' },
  s6_mng2_p: { en: 'Every component is based on observable, verifiable indicators', sw: 'Kila kijenzi kinategemea viashiria vinavyoonekana na vinavyoweza kuthibitishwa' },
  s6_mng3_b: { en: 'Risk is Reducible', sw: 'Hatari Inaweza Kupunguzwa' },
  s6_mng3_p: { en: 'We can lower risk by addressing vulnerability and strengthening coping capacity', sw: 'Tunaweza kupunguza hatari kwa kushughulikia uathirikaji na kuimarisha uwezo wa kukabili' },
  s6_mng4_b: { en: 'Risk Guides Action', sw: 'Hatari Huongoza Hatua' },
  s6_mng4_p: { en: 'Knowing the risk score helps prioritize where to invest in disaster prevention', sw: 'Kujua alama ya hatari husaidia kuweka vipaumbele vya wapi pa kuwekeza katika kuzuia maafa' },
  s6_pathways_h: { en: "Pathways to Reduce Tanzania's Risk:", sw: 'Njia za Kupunguza Hatari ya Tanzania:' },
  s6_path1_b: { en: 'Strengthen Health Systems', sw: 'Imarisha Mifumo ya Afya' },
  s6_path1_p: { en: 'Reduce vulnerability by improving maternal health, nutrition, and disease prevention', sw: 'Punguza uathirikaji kwa kuboresha afya ya uzazi, lishe, na kuzuia magonjwa' },
  s6_path2_b: { en: 'Expand Education', sw: 'Panua Elimu' },
  s6_path2_p: { en: 'Reduce vulnerability through literacy, awareness, and understanding of risks', sw: 'Punguza uathirikaji kupitia kujua kusoma na kuandika, uelewa, na ufahamu wa hatari' },
  s6_path3_b: { en: 'Build Early Warning', sw: 'Jenga Tahadhari za Mapema' },
  s6_path3_p: { en: 'Reduce lack of coping by implementing multi-hazard early warning systems', sw: 'Punguza ukosefu wa uwezo wa kukabili kwa kutekeleza mifumo ya tahadhari za mapema za majanga mengi' },
  s6_path4_b: { en: 'Invest in Response', sw: 'Wekeza katika Mwitikio' },
  s6_path4_p: { en: 'Reduce lack of coping through trained emergency services and infrastructure', sw: 'Punguza ukosefu wa uwezo wa kukabili kupitia huduma za dharura zilizofunzwa na miundombinu' },
  s6_bottom_line: { en: 'Disasters are NOT inevitable. By understanding and addressing the components of risk, Tanzania can build a safer, more resilient future. Every improvement in vulnerability or coping capacity directly reduces future disaster impacts.', sw: 'Maafa HAYAEPUKIKI bila masharti. Kwa kuelewa na kushughulikia vijenzi vya hatari, Tanzania inaweza kujenga mustakabali salama zaidi na unaohimili zaidi. Kila uboreshaji wa uathirikaji au uwezo wa kukabili hupunguza moja kwa moja athari za maafa za baadaye.' },
  s6_summary_h: { en: 'Section 6 Summary: Key Learnings', sw: 'Muhtasari wa Sehemu 6: Mafunzo Muhimu' },
  s6_sum_li1_b: { en: 'Risk', sw: 'Hatari' },
  s6_sum_li1_r: { en: 'is the combination of hazard, exposure, vulnerability, and lack of coping capacity', sw: 'ni mchanganyiko wa janga, uwazi, uathirikaji, na ukosefu wa uwezo wa kukabili' },
  s6_sum_li2_a: { en: 'The', sw: '' },
  s6_sum_li2_b: { en: 'INFORM formula', sw: 'Fomula ya INFORM' },
  s6_sum_li2_r: { en: 'uses a geometric mean to ensure all dimensions matter equally', sw: 'hutumia wastani wa kijiometri kuhakikisha vipimo vyote vina umuhimu sawa' },
  s6_sum_li3_a: { en: "Tanzania's risk score is", sw: 'Alama ya hatari ya Tanzania ni' },
  s6_sum_li3_b: { en: '4.2 (Medium-High)', sw: '4.2 (Wastani-Juu)' },
  s6_sum_li3_r: { en: ', driven primarily by elevated vulnerability', sw: ', inayochochewa hasa na uathirikaji ulioongezeka' },
  s6_sum_li4_a: { en: 'Risk is', sw: 'Hatari ni' },
  s6_sum_li4_b: { en: 'measurable, transparent, and reducible', sw: 'inayopimika, wazi, na inayoweza kupunguzwa' },
  s6_sum_li4_r: { en: '- not random or inevitable', sw: '- si ya nasibu wala isiyoepukika' },
  s6_sum_li5_a: { en: 'Scenario analysis shows how', sw: 'Uchambuzi wa hali unaonyesha jinsi' },
  s6_sum_li5_b: { en: 'targeted interventions', sw: 'hatua zilizolengwa' },
  s6_sum_li5_r: { en: 'in vulnerability or coping capacity can significantly reduce overall risk', sw: 'katika uathirikaji au uwezo wa kukabili zinavyoweza kupunguza sana hatari ya jumla' },
  s6_congrats_h: { en: "Congratulations! You've Completed Module 01", sw: 'Hongera! Umekamilisha Moduli ya 01' },
  s6_congrats_p: { en: "You now understand the INFORM Risk Framework and how it applies to Tanzania. You've learned that disasters are not natural - they result from measurable, addressable conditions. Armed with this knowledge, you're ready to explore Tanzania's specific risk profile and early warning systems.", sw: 'Sasa unaelewa Mfumo wa Hatari wa INFORM na jinsi unavyotumika nchini Tanzania. Umejifunza kwamba maafa si ya asili - yanatokana na hali zinazopimika na zinazoweza kushughulikiwa. Ukiwa na maarifa haya, uko tayari kuchunguza wasifu mahususi wa hatari wa Tanzania na mifumo ya tahadhari za mapema.' },
  s6_whats_next_h: { en: "What's Next?", sw: 'Nini Kinafuata?' },
  s6_next_module_b: { en: 'Module 02: INFORM Risk Assessment', sw: 'Moduli ya 02: Tathmini ya Hatari ya INFORM' },
  s6_next_module_r: { en: "- Dive into Tanzania's council-level risk data (195 councils across 31 regions), explore hazard maps, and analyze vulnerability and coping capacity indicators.", sw: '- Ingia kwa kina katika takwimu za hatari za ngazi ya halmashauri za Tanzania (halmashauri 195 katika mikoa 31), chunguza ramani za majanga, na changanua viashiria vya uathirikaji na uwezo wa kukabili.' },
};

import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * PUBLIC, citizen-facing INFORM EDUCATION course (portal). Read-only guided course.
 *
 * An interactive guided course on the INFORM framework — "Understanding Risk for Decision-Making
 * in Tanzania". Six sequential sections — Hazard, Exposure, Sensitivity, Vulnerability, Coping
 * Capacity, Risk — each followed by a one-question gating quiz. Pass advances + marks complete;
 * fail offers review/retry. Completing section 6 shows the course-complete state. Each section
 * carries its educational content, interactive widgets, the progress tracker, and its quiz.
 * Content is English
 * (DMIS translators add Swahili later — no i18n here).
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
      <a class="backlink" routerLink="/education">&#8592; Back to Education</a>

      <div class="gcourse-landing">
        <!-- Header -->
        <header class="gcourse-header">
          <div class="ui-eyebrow">INFORM Framework &middot; Guided Course</div>
          <h1 class="ui-h1">Understanding Risk for Decision-Making in Tanzania</h1>
        </header>

        <!-- Progress Bar -->
        <div class="progress-container">
          <div class="progress-tracker">
            @for (section of SECTIONS; track section.id) {
              <div class="progress-step {{ stepState(section.id) }}">
                <div class="step-circle">@if (!isCompleted(section.id)) { {{ section.id }} } @else { &#10003; }</div>
                <div class="step-label">
                  <div class="step-title">{{ section.title }}</div>
                  <div class="step-subtitle">{{ section.subtitle }}</div>
                </div>
              </div>
            }
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar-fill" [style.width.%]="progressPct()"></div>
          </div>
          <div class="progress-text">Section {{ currentSection() }} of 6 &bull; {{ completedSections().length }} completed</div>
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
          <button class="nav-button prev" (click)="previous()" [disabled]="currentSection() === 1">Previous</button>

          @if (!showQuiz() && !isCompleted(currentSection())) {
            <button class="nav-button quiz" (click)="takeQuiz()">Take Quiz</button>
          }
          @if (!showQuiz() && isCompleted(currentSection()) && currentSection() < 6) {
            <button class="nav-button next" (click)="goNext()">Next</button>
          }
          @if (completedSections().length === 6) {
            <button class="nav-button complete" (click)="onCourseComplete()">Continue to INFORM Risk Module</button>
          }
        </footer>

        <!-- Important Notice -->
        <div class="important-notice">
          <div class="notice-content">
            <strong>INFORM is a decision-support tool</strong> for humanitarian and development actors.
            <br />
            It requires proper training to interpret correctly. This module provides essential conceptual foundation.
          </div>
        </div>
      </div>
    </div>

    <!-- ============ QUIZ TEMPLATE ============ -->
    <ng-template #quiz>
      @if (currentQuiz(); as q) {
        <div class="quiz-container">
          <div class="quiz-header">
            <h2>Section {{ currentSection() }} Quiz: {{ q.section }}</h2>
            <p class="quiz-instruction">
              @if (!showResult()) { Select the best answer and click Submit }
              @else if (quizIsCorrect()) { Correct! You may proceed to the next section. }
              @else { Incorrect. Please review the explanation and try again. }
            </p>
          </div>
          <div class="quiz-content">
            <div class="quiz-question"><p>{{ q.question }}</p></div>
            <div class="quiz-options">
              @for (option of q.options; track $index) {
                <button class="quiz-option {{ optionClass($index) }}" (click)="selectAnswer($index)" [disabled]="showResult()">
                  <span class="option-letter">{{ letter($index) }}</span>
                  <span class="option-text">{{ option }}</span>
                  @if (showResult() && $index === q.correct) { <span class="option-indicator"></span> }
                  @if (showResult() && selectedAnswer() === $index && $index !== q.correct) { <span class="option-indicator"></span> }
                </button>
              }
            </div>
            @if (showExplanation()) {
              <div class="quiz-explanation {{ quizIsCorrect() ? 'correct-box' : 'incorrect-box' }}">
                <div class="explanation-title">{{ quizIsCorrect() ? 'Correct!' : 'Incorrect' }}</div>
                <div class="explanation-text">{{ q.explanation }}</div>
              </div>
            }
          </div>
          <div class="quiz-footer">
            @if (!showResult()) {
              <button class="quiz-submit-btn" (click)="submitQuiz()" [disabled]="selectedAnswer() === null">Submit Answer</button>
            } @else {
              <button class="quiz-continue-btn {{ quizIsCorrect() ? 'success' : 'retry' }}" (click)="continueQuiz()">
                {{ quizIsCorrect() ? 'Continue to Next Section' : 'Review Section and Retry' }}
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
          <div class="section-number">SECTION 1 OF 6</div>
          <h2 class="section-title">HAZARD: What Can Happen?</h2>
          <p class="section-intro">Understanding what hazards are and why they don't automatically cause disasters</p>
        </div>

        <div class="inform-definition">
          <div class="definition-header"><span class="definition-label">INFORM Definition</span></div>
          <div class="definition-content">
            <h3>What is a Hazard?</h3>
            <p><strong>A hazard is a potentially damaging physical or human-induced event.</strong></p>
            <p>Hazards are natural or human processes that may cause loss of life, injury, property damage, social and economic disruption, or environmental degradation.</p>
          </div>
        </div>

        <div class="teaching-box critical">
          <div class="teaching-content">
            <h4>CRITICAL LESSON</h4>
            <div class="teaching-divider"></div>
            <h3>HAZARD and DISASTER</h3>
            <p class="teaching-emphasis">A hazard becomes a disaster only when:</p>
            <ul class="teaching-list">
              <li><strong>People are exposed</strong> (living in hazard zones)</li>
              <li><strong>Communities are vulnerable</strong> (poor housing, health, resources)</li>
              <li><strong>Response capacity is inadequate</strong> (weak early warning, emergency services)</li>
            </ul>
            <div class="teaching-example">
              <strong>Example:</strong> A flood in an uninhabited forest has <strong>zero humanitarian risk</strong>.
              The same flood in a densely populated area with poor drainage becomes a disaster.
            </div>
          </div>
        </div>

        <div class="tanzania-hazards">
          <h3 class="subsection-title">Hazards in Tanzania</h3>
          <p class="subsection-intro">Tanzania faces multiple types of hazards. Understanding each type helps in planning and preparedness.</p>

          <div class="category-selector">
            @for (key of s1CategoryKeys; track key) {
              <button class="category-button" [class.active]="s1Category() === key"
                (click)="s1SelectCategory($any(key))"
                [style.borderColor]="s1Category() === key ? HAZARD_CATEGORIES[key].color : '#ddd'"
                [style.backgroundColor]="s1Category() === key ? HAZARD_CATEGORIES[key].color : 'white'"
                [style.color]="s1Category() === key ? 'white' : '#333'">
                <span class="category-title">{{ HAZARD_CATEGORIES[key].title }}</span>
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
                  <h4 class="hazard-name">{{ hazard.name }}</h4>
                  <div class="hazard-frequency">
                    <span class="frequency-label">Frequency:</span>
                    <span class="frequency-value">{{ hazard.frequency }}</span>
                  </div>
                </div>
              </div>
            }
          </div>

          @if (s1SelectedHazard(); as sel) {
            <div class="hazard-details" [style.borderLeftColor]="s1CurrentCategory().color">
              <h4>{{ sel.name }}</h4>
              <div class="detail-grid">
                <div class="detail-item"><span class="detail-label">Category:</span><span class="detail-value">{{ s1CurrentCategory().title }}</span></div>
                <div class="detail-item"><span class="detail-label">Typical Frequency:</span><span class="detail-value">{{ sel.frequency }}</span></div>
                <div class="detail-item"><span class="detail-label">Status:</span><span class="detail-value">{{ s1HazardStatus(sel.id) }}</span></div>
              </div>
            </div>
          }
        </div>

        <div class="no-impact-notice">
          <div class="notice-text">
            <strong>Important:</strong> At this stage, we are only identifying <strong>what can happen</strong>.
            <br />We have NOT mentioned population, impact, or disaster yet.
            <br /><span class="notice-emphasis-inline">This teaches: "Events exist, but they don't automatically cause crises"</span>
          </div>
        </div>

        <div class="historical-timeline">
          <h3 class="subsection-title">Major Hazard Events in Tanzania (Last 10 Years)</h3>
          <p class="subsection-intro">Historical frequency helps us understand hazard patterns, but does NOT predict impact.</p>
          <div class="timeline-chart">
            <div class="timeline-year-labels">
              @for (year of TIMELINE_YEARS; track year) { <div class="year-label">{{ year }}</div> }
            </div>
            <div class="timeline-events">
              <div class="event-row floods">
                <span class="event-type">Floods</span>
                <div class="event-markers">
                  <div class="event-marker" style="left:10%"></div>
                  <div class="event-marker" style="left:30%"></div>
                  <div class="event-marker" style="left:50%"></div>
                  <div class="event-marker" style="left:70%"></div>
                  <div class="event-marker" style="left:90%"></div>
                </div>
              </div>
              <div class="event-row drought">
                <span class="event-type">Drought</span>
                <div class="event-markers">
                  <div class="event-marker" style="left:25%;width:30%"></div>
                  <div class="event-marker" style="left:65%;width:25%"></div>
                </div>
              </div>
              <div class="event-row epidemics">
                <span class="event-type">Epidemics</span>
                <div class="event-markers">
                  <div class="event-marker" style="left:15%"></div>
                  <div class="event-marker" style="left:55%;width:35%"></div>
                </div>
              </div>
              <div class="event-row cyclones">
                <span class="event-type">Cyclones</span>
                <div class="event-markers">
                  <div class="event-marker" style="left:40%"></div>
                  <div class="event-marker" style="left:85%"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="timeline-note">
            <strong>Note:</strong> This is a simplified representation. Actual hazard monitoring data
            would show precise dates, intensities, and affected locations.
          </div>
        </div>

        <div class="section-summary purple">
          <h4>Section 1 Summary: What You Learned</h4>
          <ul>
            <li>Hazards are potentially damaging events (natural or human)</li>
            <li>Tanzania faces multiple hazard types with varying frequencies</li>
            <li><strong>Hazards alone do NOT create disasters</strong></li>
            <li>Impact depends on exposure, vulnerability, and coping capacity (coming next!)</li>
          </ul>
          <div class="next-preview"><strong>Next Section:</strong> EXPOSURE - Where hazards meet people</div>
        </div>
      </div>
    </ng-template>

    <!-- ============ SECTION 2: EXPOSURE ============ -->
    <ng-template #sec2>
      <div class="section2-exposure">
        <div class="section-header">
          <h1>Section 2: Exposure</h1>
          <p class="section-subtitle">Where Hazards Meet People</p>
        </div>

        <div class="definition-box exposure-definition">
          <div class="definition-content">
            <h3>What is Exposure?</h3>
            <p class="inform-definition-p"><strong>INFORM Definition:</strong> Exposure is the presence of people, infrastructure, or livelihoods in hazard-prone areas.</p>
            <p class="definition-explanation">A hazard only creates risk when people, buildings, or economic activities are located where the hazard can occur. <strong>Exposure answers: "Who or what is in harm's way?"</strong></p>
          </div>
        </div>

        <div class="concept-section">
          <h2>The Overlay Concept</h2>
          <p class="concept-intro">Exposure is created when hazard zones and population overlap. Think of it as layering two maps on top of each other:</p>
          <div class="overlay-visualization">
            <div class="overlay-controls">
              @for (step of OVERLAY_STEPS; track step.id) {
                <button class="overlay-step-button" [class.active]="s2OverlayStep() === step.id"
                  (click)="s2OverlayStep.set(step.id)"
                  [style.borderColor]="s2OverlayStep() === step.id ? step.color : '#ddd'"
                  [style.backgroundColor]="s2OverlayStep() === step.id ? step.color : 'white'"
                  [style.color]="s2OverlayStep() === step.id ? 'white' : '#333'">
                  <span class="step-title-s">{{ step.title }}</span>
                </button>
              }
            </div>
            <div class="overlay-display">
              <div class="overlay-layer hazard-layer" [class.visible]="s2OverlayStep() >= 0">
                <div class="layer-label">Hazard Zone</div><div class="layer-pattern hazard-pattern"></div>
              </div>
              <div class="overlay-layer population-layer" [class.visible]="s2OverlayStep() >= 1">
                <div class="layer-label">Population</div><div class="layer-pattern population-pattern"></div>
              </div>
              <div class="overlay-layer exposure-layer" [class.visible]="s2OverlayStep() >= 2">
                <div class="layer-label">Exposure (Overlap)</div><div class="layer-pattern exposure-pattern"></div>
              </div>
            </div>
            <div class="overlay-explanation">
              <p>{{ OVERLAY_STEPS[s2OverlayStep()].description }}</p>
              @if (s2OverlayStep() === 2) { <div class="overlay-formula"><strong>Hazard Zone + Population = Exposure</strong></div> }
            </div>
          </div>
        </div>

        <div class="teaching-box exposure-types">
          <div class="teaching-content">
            <h3>Two Ways to Measure Exposure</h3>
            <div class="exposure-comparison">
              <div class="exposure-type">
                <div class="exposure-type-header"><h4>Absolute Exposure</h4></div>
                <p><strong>Definition:</strong> The total number of people in hazard zones</p>
                <p class="example-text"><em>Example:</em> 1,200,000 people live in Dar es Salaam's flood zone</p>
                <p class="why-important"><strong>Why it matters:</strong> Shows the scale of potential impact</p>
              </div>
              <div class="divider-vertical"></div>
              <div class="exposure-type">
                <div class="exposure-type-header"><h4>Relative Exposure</h4></div>
                <p><strong>Definition:</strong> The percentage of population in hazard zones</p>
                <p class="example-text"><em>Example:</em> 65% of Dar es Salaam's population lives in the flood zone</p>
                <p class="why-important"><strong>Why it matters:</strong> Shows the proportion of the community at risk</p>
              </div>
            </div>
            <div class="inform-note">
              <strong>INFORM uses both metrics</strong> to avoid bias toward large or small populations.
              A small district with 100% exposure needs as much attention as a large city with lower percentage.
            </div>
          </div>
        </div>

        <div class="exposure-data-section">
          <h2>Exposure in Tanzania: Real Data</h2>
          <p class="data-intro">Select a district below to see how many people live in hazard-prone areas:</p>
          <div class="districts-grid">
            @for (district of EXPOSURE_DATA; track district.id) {
              <div class="district-card" [class.selected]="s2SelectedDistrict()?.id === district.id" (click)="s2SelectedDistrict.set(district)">
                <div class="district-header">
                  <h4>{{ district.name }}</h4>
                  <span class="hazard-badge" [style.backgroundColor]="hazardBadgeColor(district.hazardType)">{{ district.hazardType }}</span>
                </div>
                <div class="district-metric">
                  <div class="metric-value">{{ fmtNum(district.population) }}</div>
                  <div class="metric-label">People in Hazard Zone</div>
                </div>
                <div class="district-percentage">
                  <div class="percentage-bar"><div class="percentage-fill" [style.width.%]="district.relativeExposure"></div></div>
                  <div class="percentage-text">{{ district.relativeExposure }}% Exposed</div>
                </div>
              </div>
            }
          </div>
          @if (s2SelectedDistrict(); as sel) {
            <div class="district-details">
              <h3>{{ sel.name }} - Detailed Exposure</h3>
              <div class="details-grid">
                <div class="detail-item"><div class="detail-label">Hazard Zone Area</div><div class="detail-value">{{ fmtNum(sel.hazardZone) }} km&sup2;</div></div>
                <div class="detail-item"><div class="detail-label">Population in Zone (Absolute)</div><div class="detail-value">{{ fmtNum(sel.population) }}</div></div>
                <div class="detail-item"><div class="detail-label">Total District Population</div><div class="detail-value">{{ fmtNum(sel.totalPopulation) }}</div></div>
                <div class="detail-item"><div class="detail-label">Exposure Rate (Relative)</div><div class="detail-value">{{ sel.relativeExposure }}%</div></div>
              </div>
              <div class="detail-description"><strong>Hazard Context:</strong> {{ sel.description }}</div>
            </div>
          }
        </div>

        <div class="teaching-box tanzania-challenge">
          <div class="teaching-content">
            <h3>Tanzania's Exposure Challenge</h3>
            <div class="challenge-formula">
              <div class="formula-part">Moderate to High Hazards</div>
              <div class="formula-operator">+</div>
              <div class="formula-part">High Population Exposure</div>
              <div class="formula-operator">=</div>
              <div class="formula-result">Significant Potential Impact</div>
            </div>
            <div class="challenge-example">
              <strong>Example: Dar es Salaam</strong>
              <ul>
                <li>Moderate flood hazard (coastal + riverine)</li>
                <li>65% of population in flood zone (1.2 million people)</li>
                <li>Result: Very high flood exposure</li>
              </ul>
            </div>
            <p class="challenge-note"><strong>Key Insight:</strong> Even moderate hazards create significant risk when large populations are exposed. This is why location planning and early warning systems are crucial for Tanzania.</p>
          </div>
        </div>

        <div class="notice-box exposure-notice">
          <div class="notice-content">
            <h4>Still Learning Concepts - No Impact Assessment Yet</h4>
            <p>We've now covered <strong>Hazard</strong> (what can happen) and <strong>Exposure</strong> (who is in harm's way). But we still haven't mentioned:</p>
            <ul class="notice-list">
              <li><strong>Vulnerability</strong> (why some suffer more)</li>
              <li><strong>Impact severity</strong> (how bad it gets)</li>
              <li><strong>Risk calculation</strong> (combining all factors)</li>
            </ul>
            <p class="notice-emphasis-box"><strong>Being exposed doesn't automatically mean disaster.</strong> The next sections will show why some exposed populations are more vulnerable than others.</p>
          </div>
        </div>

        <div class="summary-purple">
          <h3>Section 2 Summary: Key Learnings</h3>
          <div class="summary-points">
            <div class="summary-point"><span class="check-icon"></span><span class="point-text"><strong>Exposure</strong> is created when people live or work in hazard-prone areas</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">We measure exposure in two ways: <strong>absolute</strong> (total people) and <strong>relative</strong> (percentage)</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">Tanzania has <strong>high exposure</strong> in many districts due to population concentration in hazard zones</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text"><strong>Location matters</strong> - the same hazard affects different numbers of people depending on where they live</span></div>
          </div>
          <div class="next-section-preview">
            <h4>Next Section: Sensitivity</h4>
            <p>We know <em>what hazards exist</em> and <em>who is exposed</em>. But why do the same hazards cause different levels of impact? Section 3 explores <strong>sensitivity</strong> - how strongly people are affected when hazards occur.</p>
          </div>
        </div>
      </div>
    </ng-template>
    <!-- ============ SECTION 3: SENSITIVITY ============ -->
    <ng-template #sec3>
      <div class="section3-sensitivity">
        <div class="section-header">
          <h1>Section 3: Sensitivity</h1>
          <p class="section-subtitle">How Severely People Are Affected</p>
        </div>

        <div class="definition-box sensitivity-definition">
          <div class="definition-content">
            <h3>What is Sensitivity?</h3>
            <p class="inform-definition-p"><strong>Scientific Definition:</strong> Sensitivity is how strongly exposed people are affected when a hazard occurs.</p>
            <p class="definition-explanation">Two communities can face the <strong>same hazard</strong> with the <strong>same exposure</strong>, but experience <strong>vastly different impacts</strong>. Sensitivity explains why some communities suffer more than others.</p>
            <div class="inform-note-small"><strong>INFORM Note:</strong> INFORM embeds sensitivity within the Vulnerability dimension (socio-economic factors + vulnerable groups). We teach it separately for clarity.</div>
          </div>
        </div>

        <div class="comparison-section">
          <h2>Same Hazard, Different Outcomes</h2>
          <p class="comparison-intro">Let's compare two districts that experienced the <strong>exact same flood</strong> but had <strong>very different results</strong>:</p>
          <div class="comparison-controls">
            <button class="comparison-button" [class.active]="s3Selected() === 'districtA'" (click)="s3Selected.set('districtA')"
              [style.borderColor]="s3Selected() === 'districtA' ? '#D32F2F' : '#ddd'" [style.backgroundColor]="s3Selected() === 'districtA' ? '#FFEBEE' : 'white'">District A (High Sensitivity)</button>
            <button class="comparison-button" [class.active]="s3Selected() === 'both'" (click)="s3Selected.set('both')"
              [style.borderColor]="s3Selected() === 'both' ? '#FF9800' : '#ddd'" [style.backgroundColor]="s3Selected() === 'both' ? '#FFF3E0' : 'white'">Compare Both</button>
            <button class="comparison-button" [class.active]="s3Selected() === 'districtB'" (click)="s3Selected.set('districtB')"
              [style.borderColor]="s3Selected() === 'districtB' ? '#43A047' : '#ddd'" [style.backgroundColor]="s3Selected() === 'districtB' ? '#E8F5E9' : 'white'">District B (Low Sensitivity)</button>
          </div>
          <div class="comparison-display {{ s3Selected() === 'both' ? 'side-by-side' : 'single' }}">
            @if (s3Selected() === 'districtA' || s3Selected() === 'both') {
              <div class="district-column" style="border-color:#D32F2F">
                <div class="district-title" style="background-color:#D32F2F">{{ CASE_STUDY.districtA.name }}</div>
                <div class="hazard-same"><strong>Same Flood:</strong> {{ CASE_STUDY.districtA.flood }}</div>
                <div class="factors-list">
                  @for (f of s3FactorList(CASE_STUDY.districtA); track f.type) {
                    <div class="factor-item high"><div class="factor-content"><strong>{{ f.type }}</strong><p>{{ f.details }}</p></div></div>
                  }
                </div>
                <div class="outcome-box" [style.backgroundColor]="CASE_STUDY.districtA.outcomeColor">
                  <div class="outcome-label">{{ CASE_STUDY.districtA.outcome }}</div>
                  <div class="outcome-type">({{ CASE_STUDY.districtA.outcomeType }})</div>
                  <p class="outcome-details">{{ CASE_STUDY.districtA.outcomeDetails }}</p>
                </div>
              </div>
            }
            @if (s3Selected() === 'both') { <div class="comparison-arrow">&#8594;</div> }
            @if (s3Selected() === 'districtB' || s3Selected() === 'both') {
              <div class="district-column" style="border-color:#43A047">
                <div class="district-title" style="background-color:#43A047">{{ CASE_STUDY.districtB.name }}</div>
                <div class="hazard-same"><strong>Same Flood:</strong> {{ CASE_STUDY.districtB.flood }}</div>
                <div class="factors-list">
                  @for (f of s3FactorList(CASE_STUDY.districtB); track f.type) {
                    <div class="factor-item low"><div class="factor-content"><strong>{{ f.type }}</strong><p>{{ f.details }}</p></div></div>
                  }
                </div>
                <div class="outcome-box" [style.backgroundColor]="CASE_STUDY.districtB.outcomeColor">
                  <div class="outcome-label">{{ CASE_STUDY.districtB.outcome }}</div>
                  <div class="outcome-type">({{ CASE_STUDY.districtB.outcomeType }})</div>
                  <p class="outcome-details">{{ CASE_STUDY.districtB.outcomeDetails }}</p>
                </div>
              </div>
            }
          </div>
        </div>

        <div class="factors-section">
          <h2>Sensitivity Factors in Tanzania</h2>
          <p class="factors-intro">These are the key factors that determine how severely Tanzanian communities are affected by hazards:</p>
          <div class="factors-grid">
            @for (factor of SENSITIVITY_FACTORS; track factor.id) {
              <div class="sensitivity-factor-card" [class.selected]="s3Factor()?.id === factor.id" (click)="s3ToggleFactor(factor)"
                [style.borderColor]="s3Factor()?.id === factor.id ? factor.color : '#E0E0E0'">
                <div class="factor-header" [style.backgroundColor]="factor.color"><h4>{{ factor.name }}</h4></div>
                <div class="factor-body">
                  <p class="factor-description">{{ factor.description }}</p>
                  <div class="indicators-list">
                    @for (ind of factor.indicators; track ind.label) {
                      <div class="indicator-item risk-{{ ind.risk }}"><div class="indicator-label">{{ ind.label }}</div><div class="indicator-value">{{ ind.value }}</div></div>
                    }
                  </div>
                  <div class="tanzania-note"><strong>Tanzania:</strong> {{ factor.tanzaniaNote }}</div>
                </div>
              </div>
            }
          </div>
        </div>

        <div class="teaching-box disasters-not-natural">
          <div class="teaching-content">
            <h3>CRITICAL INSIGHT: "Disasters Are Not Natural"</h3>
            <div class="insight-explanation">
              <p class="insight-emphasis"><strong>Natural hazards are inevitable.</strong> Floods, droughts, and cyclones will always occur.</p>
              <p class="insight-main">But <strong>DISASTERS</strong> - the death, displacement, and suffering - are <strong>NOT natural</strong>. They are created by:</p>
              <div class="disaster-causes">
                <div class="cause-item"><div class="cause-text"><strong>Poverty</strong><p>Inability to build safe homes or evacuate</p></div></div>
                <div class="cause-item"><div class="cause-text"><strong>Poor Infrastructure</strong><p>Weak housing, no drainage, bad roads</p></div></div>
                <div class="cause-item"><div class="cause-text"><strong>Weak Health Systems</strong><p>Malnutrition, disease, limited healthcare</p></div></div>
                <div class="cause-item"><div class="cause-text"><strong>Inequality</strong><p>Marginalized groups suffer disproportionately</p></div></div>
              </div>
              <div class="insight-conclusion">
                <strong>&#8594; Reducing sensitivity reduces disaster impact</strong>
                <p>This is why development matters. Improving housing, health, infrastructure, and equality <strong>saves lives during hazards</strong>.</p>
              </div>
            </div>
          </div>
        </div>

        <div class="summary-purple">
          <h3>Section 3 Summary: Key Learnings</h3>
          <div class="summary-points">
            <div class="summary-point"><span class="check-icon"></span><span class="point-text"><strong>Sensitivity</strong> determines how severely people are affected when hazards occur</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">The <strong>same hazard</strong> can cause a <strong>disaster</strong> in one place and be <strong>manageable</strong> in another - sensitivity makes the difference</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">Key sensitivity factors: <strong>housing quality, health status, infrastructure, economic status</strong></span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text"><strong>Disasters are NOT natural</strong> - they're created by poverty, inequality, and weak systems</span></div>
          </div>
          <div class="next-section-preview">
            <h4>Next Section: Vulnerability</h4>
            <p>We've learned how sensitivity affects impact. Now we'll explore <strong>vulnerability</strong> - the broader concept that INFORM uses to assess which communities are most at risk. This is where we'll start to see the <strong>INFORM formula</strong> taking shape.</p>
          </div>
        </div>
      </div>
    </ng-template>

    <!-- ============ SECTION 4: VULNERABILITY ============ -->
    <ng-template #sec4>
      <div class="section4-vulnerability">
        <div class="section-header">
          <h1>Section 4: Vulnerability</h1>
          <p class="section-subtitle">Why Some Communities Suffer More</p>
        </div>

        <div class="definition-box vulnerability-definition">
          <div class="definition-content">
            <h3>What is Vulnerability?</h3>
            <p class="inform-definition-p"><strong>INFORM Definition:</strong> Vulnerability is the susceptibility of communities to hazards - how likely they are to suffer harm when a hazard occurs.</p>
            <p class="definition-explanation">Vulnerability is NOT created by disasters - it <strong>exists before disasters happen</strong>. It's made up of pre-existing conditions like poverty, weak health, and marginalized populations.</p>
            <div class="vulnerability-emphasis"><strong>Critical Point:</strong> Vulnerability is a root cause, not a consequence. It determines who suffers most when hazards strike.</div>
          </div>
        </div>

        <div class="components-section">
          <h2>INFORM's Two Components of Vulnerability</h2>
          <p class="components-intro">INFORM measures vulnerability through two complementary dimensions:</p>
          <div class="component-selector">
            <button class="component-button" [class.active]="s4Category() === 'socioeconomic'" (click)="s4Category.set('socioeconomic')"
              [style.borderColor]="s4Category() === 'socioeconomic' ? '#E65100' : '#ddd'" [style.backgroundColor]="s4Category() === 'socioeconomic' ? '#FFF3E0' : 'white'">
              <div class="component-label"><strong>1. Socio-Economic Vulnerability</strong><p>Development, poverty, health, education</p></div>
            </button>
            <button class="component-button" [class.active]="s4Category() === 'groups'" (click)="s4Category.set('groups')"
              [style.borderColor]="s4Category() === 'groups' ? '#FF9800' : '#ddd'" [style.backgroundColor]="s4Category() === 'groups' ? '#FFF3E0' : 'white'">
              <div class="component-label"><strong>2. Vulnerable Groups</strong><p>Children, elderly, PWDs, displaced</p></div>
            </button>
          </div>

          @if (s4Category() === 'socioeconomic') {
            <div class="category-content socioeconomic-content">
              <h3>Socio-Economic Vulnerability in Tanzania</h3>
              <p class="category-description">These pre-existing development gaps make communities more susceptible to disasters:</p>
              <div class="indicators-grid">
                @for (indicator of SOCIOECONOMIC_INDICATORS; track indicator.id) {
                  <div class="indicator-card">
                    <div class="indicator-header" [style.backgroundColor]="indicator.color"><h4>{{ indicator.category }}</h4></div>
                    <div class="indicator-body">
                      <div class="indicator-metrics">
                        @for (metric of indicator.indicators; track metric.name) {
                          <div class="metric-row severity-{{ metric.severity }}"><span class="metric-name">{{ metric.name }}</span><span class="metric-value">{{ metric.value }}</span></div>
                        }
                      </div>
                      <div class="indicator-impact"><strong>Why it matters:</strong> {{ indicator.impact }}</div>
                    </div>
                  </div>
                }
              </div>
            </div>
          }

          @if (s4Category() === 'groups') {
            <div class="category-content groups-content">
              <h3>Vulnerable Groups in Tanzania</h3>
              <p class="category-description">These population segments face disproportionate harm during disasters:</p>
              <div class="groups-grid">
                @for (group of VULNERABLE_GROUPS; track group.id) {
                  <div class="group-card" [class.selected]="s4Group()?.id === group.id" (click)="s4ToggleGroup(group)"
                    [style.borderColor]="s4Group()?.id === group.id ? group.color : '#E0E0E0'">
                    <div class="group-header">
                      <div class="group-info">
                        <h4>{{ group.name }}</h4>
                        <div class="group-stats"><span class="stat">{{ group.population }} of population</span><span class="stat-divider">|</span><span class="stat">{{ group.count }}</span></div>
                      </div>
                    </div>
                    @if (s4Group()?.id === group.id) {
                      <div class="group-details">
                        <div class="why-vulnerable"><strong>Why Vulnerable:</strong>
                          <ul>@for (reason of group.whyVulnerable; track reason) { <li>{{ reason }}</li> }</ul>
                        </div>
                        <div class="tanzania-context"><strong>Tanzania Context:</strong> {{ group.tanzaniaContext }}</div>
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
            <h2>Introducing the INFORM Risk Equation</h2>
            <p>You've now learned about <strong>Hazard</strong>, <strong>Exposure</strong>, and <strong>Vulnerability</strong>. It's time to see how INFORM combines these into a mathematical framework for measuring risk.</p>
            <button class="reveal-button" (click)="s4ShowFormula.set(!s4ShowFormula())" [style.backgroundColor]="s4ShowFormula() ? '#43A047' : '#1976D2'">
              {{ s4ShowFormula() ? 'Formula Revealed' : 'Click to Reveal INFORM Formula' }}
            </button>
          </div>
          @if (s4ShowFormula()) {
            <div class="formula-box">
              <div class="formula-title">INFORM RISK EQUATION (1 of 3 Dimensions Revealed)</div>
              <div class="formula-equation"><div class="formula-text">Risk = (H and E)<sup>1/3</sup> &times; (V)<sup>1/3</sup> &times; (LCC)<sup>1/3</sup></div></div>
              <div class="formula-highlight"><div class="highlight-arrow"></div><div class="highlight-label-single">VULNERABILITY</div></div>
              <div class="formula-explanation">
                <h4>What This Means:</h4>
                <div class="explanation-grid">
                  <div class="explanation-item"><div class="explanation-text"><strong>V = Vulnerability</strong><p>Combines socio-economic vulnerability + vulnerable groups</p></div></div>
                  <div class="explanation-item"><div class="explanation-text"><strong>Pre-Existing</strong><p>Vulnerability exists BEFORE disasters occur</p></div></div>
                  <div class="explanation-item"><div class="explanation-text"><strong>Reducible</strong><p>Reducing V reduces future risk - this is prevention!</p></div></div>
                  <div class="explanation-item"><div class="explanation-text"><strong>Development Reduces Risk</strong><p>Better health, education, housing = Lower vulnerability = Lower risk</p></div></div>
                </div>
                <div class="formula-note"><strong>Note:</strong> We'll reveal the other dimensions (H and E and LCC) in the next sections. For now, understand that <strong>Vulnerability is an equal pillar of risk</strong>.</div>
              </div>
            </div>
          }
        </div>

        <div class="teaching-box vulnerability-preexisting">
          <div class="teaching-content">
            <h3>KEY EMPHASIS: Vulnerability Is Pre-Existing</h3>
            <div class="emphasis-grid">
              <div class="emphasis-item"><div class="emphasis-text"><strong>Exists Before Disasters</strong><p>Vulnerability is present in communities long before hazards strike</p></div></div>
              <div class="emphasis-item"><div class="emphasis-text"><strong>Can Be Measured</strong><p>We can quantify vulnerability using indicators like poverty, health, and education</p></div></div>
              <div class="emphasis-item"><div class="emphasis-text"><strong>Can Be Reduced</strong><p>Development interventions lower vulnerability and prevent future disasters</p></div></div>
              <div class="emphasis-item"><div class="emphasis-text"><strong>Reduction = Prevention</strong><p>Every improvement in vulnerability is a reduction in future disaster risk</p></div></div>
            </div>
            <div class="tanzania-example-box">
              <h4>Example: Tanzania</h4>
              <ul class="tanzania-examples">
                <li><strong>Improving nutrition</strong> &#8594; Lower vulnerability to droughts</li>
                <li><strong>Better housing</strong> &#8594; Lower vulnerability to floods and landslides</li>
                <li><strong>Stronger health systems</strong> &#8594; Lower vulnerability to epidemics</li>
                <li><strong>Education programs</strong> &#8594; Better understanding of warnings and risks</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="summary-purple">
          <h3>Section 4 Summary: Key Learnings</h3>
          <div class="summary-points">
            <div class="summary-point"><span class="check-icon"></span><span class="point-text"><strong>Vulnerability</strong> is the susceptibility of communities to hazards - it determines who suffers most</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">INFORM measures vulnerability through <strong>two components</strong>: socio-economic factors and vulnerable groups</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">Vulnerability <strong>exists before disasters</strong> - it's a root cause, not a consequence</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">The <strong>INFORM formula</strong> uses Vulnerability as one of three equal dimensions of risk</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text"><strong>Reducing vulnerability = Prevention</strong> - development saves lives</span></div>
          </div>
          <div class="next-section-preview">
            <h4>Next Section: Coping Capacity</h4>
            <p>We've seen how vulnerability increases risk. But what about a community's ability to manage disasters? Section 5 introduces <strong>Coping Capacity</strong> - the other side of the coin. Strong coping capacity can counterbalance vulnerability and reduce risk, even in highly exposed areas.</p>
          </div>
        </div>
      </div>
    </ng-template>
    <!-- ============ SECTION 5: COPING CAPACITY ============ -->
    <ng-template #sec5>
      <div class="section5-coping">
        <div class="section-header">
          <h1>Section 5: Coping Capacity</h1>
          <p class="section-subtitle">Ability to Prepare, Respond, and Recover</p>
        </div>

        <div class="definition-box coping-definition">
          <div class="definition-content">
            <h3>What is Coping Capacity?</h3>
            <p class="inform-definition-p"><strong>INFORM Definition:</strong> Coping capacity is the ability of systems, institutions, and communities to reduce disaster impact through preparedness, response, and recovery.</p>
            <p class="definition-explanation"><strong>Coping capacity counterbalances vulnerability.</strong> Even highly exposed and vulnerable populations may avoid crisis if coping capacity is strong. This is why investing in disaster management systems, infrastructure, and health services saves lives.</p>
            <div class="capacity-note"><strong>INFORM uses "Lack of Coping Capacity" (LCC):</strong> Strong capacity = Low LCC = Lower risk</div>
          </div>
        </div>

        <div class="framework-section">
          <h2>The Coping Capacity Framework</h2>
          <p class="framework-intro">Coping capacity works across three phases of the disaster cycle:</p>
          <div class="phases-selector">
            @for (phase of PHASE_TABS; track phase.id) {
              <button class="phase-button" [class.active]="s5Phase() === phase.id" (click)="s5Phase.set($any(phase.id))"><span>{{ phase.label }}</span></button>
            }
          </div>
          <div class="phases-display">
            @for (phase of s5VisiblePhases(); track phase.id) {
              <div class="phase-card" [style.borderColor]="phase.color">
                <div class="phase-header" [style.backgroundColor]="phase.color"><h3>{{ phase.name }}</h3></div>
                <div class="phase-body">
                  <p class="phase-description">{{ phase.description }}</p>
                  <div class="activities-list"><strong>Key Activities:</strong>
                    <ul>@for (activity of phase.activities; track activity) { <li>{{ activity }}</li> }</ul>
                  </div>
                </div>
              </div>
            }
          </div>
        </div>

        <div class="components-section">
          <h2>Tanzania's Coping Capacity: Three Components</h2>
          <p class="components-intro">INFORM measures coping capacity through these three dimensions:</p>
          <div class="capacity-components-grid">
            @for (component of CAPACITY_COMPONENTS; track component.id) {
              <div class="capacity-component-card" [class.selected]="s5Component()?.id === component.id" (click)="s5ToggleComponent(component)"
                [style.borderColor]="s5Component()?.id === component.id ? component.color : '#E0E0E0'">
                <div class="component-header" [style.backgroundColor]="component.color"><h4>{{ component.name }}</h4></div>
                <div class="component-body">
                  <p class="component-description">{{ component.description }}</p>
                  <div class="indicators-list">
                    @for (indicator of component.indicators; track indicator.name) {
                      <div class="indicator-row level-{{ indicator.level }}"><span class="indicator-name">{{ indicator.name }}</span><span class="indicator-status">{{ indicator.status }}</span></div>
                    }
                  </div>
                  <div class="component-note"><strong>Tanzania:</strong> {{ component.tanzaniaNote }}</div>
                </div>
              </div>
            }
          </div>
        </div>

        <div class="comparison-section">
          <h2>Capacity Makes the Difference</h2>
          <p class="comparison-intro"><strong>Same hazard, same exposure, same vulnerability</strong> - but <strong>different coping capacity</strong> leads to vastly different outcomes:</p>
          <div class="comparison-controls">
            @for (view of COMPARISON_VIEWS; track view.id) {
              <button class="comparison-button" [class.active]="s5ComparisonView() === view.id" (click)="s5ComparisonView.set($any(view.id))">{{ view.label }}</button>
            }
          </div>
          <div class="comparison-display coping {{ s5ComparisonView() === 'both' ? 'side-by-side' : 'single' }}">
            @if (s5ComparisonView() === 'both' || s5ComparisonView() === 'high') {
              <div class="scenario-column high-capacity">
                <div class="scenario-title" [style.backgroundColor]="COMPARISON_SCENARIOS.high.color">{{ COMPARISON_SCENARIOS.high.title }}</div>
                @for (example of COMPARISON_SCENARIOS.high.examples; track example.hazard) {
                  <div class="scenario-example">
                    <div class="example-hazard">{{ example.hazard }}</div>
                    <div class="example-outcome success">{{ example.outcome }}</div>
                    <ul class="example-details">@for (detail of example.details; track detail) { <li>{{ detail }}</li> }</ul>
                  </div>
                }
              </div>
            }
            @if (s5ComparisonView() === 'both' || s5ComparisonView() === 'low') {
              <div class="scenario-column low-capacity">
                <div class="scenario-title" [style.backgroundColor]="COMPARISON_SCENARIOS.low.color">{{ COMPARISON_SCENARIOS.low.title }}</div>
                @for (example of COMPARISON_SCENARIOS.low.examples; track example.hazard) {
                  <div class="scenario-example">
                    <div class="example-hazard">{{ example.hazard }}</div>
                    <div class="example-outcome crisis">{{ example.outcome }}</div>
                    <ul class="example-details">@for (detail of example.details; track detail) { <li>{{ detail }}</li> }</ul>
                  </div>
                }
              </div>
            }
          </div>
        </div>

        <div class="formula-reveal-section">
          <div class="reveal-intro">
            <h2>INFORM Formula: Second Dimension</h2>
            <p>You've seen how <strong>Vulnerability</strong> increases risk. Now see how <strong>Lack of Coping Capacity</strong> works alongside it in the INFORM equation.</p>
            <button class="reveal-button" (click)="s5ShowFormula.set(!s5ShowFormula())" [style.backgroundColor]="s5ShowFormula() ? '#43A047' : '#1976D2'">
              {{ s5ShowFormula() ? 'Second Dimension Revealed' : 'Reveal Second Dimension' }}
            </button>
          </div>
          @if (s5ShowFormula()) {
            <div class="formula-box">
              <div class="formula-title">INFORM RISK EQUATION (2 of 3 Dimensions Revealed)</div>
              <div class="formula-equation"><div class="formula-text">Risk = (H and E)<sup>1/3</sup> &times; (V)<sup>1/3</sup> &times; (LCC)<sup>1/3</sup></div></div>
              <div class="formula-highlights">
                <div class="formula-highlight"><div class="highlight-arrow"></div><div class="highlight-label-pill vulnerability">V = Vulnerability</div></div>
                <div class="formula-highlight"><div class="highlight-arrow"></div><div class="highlight-label-pill capacity">LCC = Lack of Coping Capacity</div></div>
              </div>
              <div class="formula-explanation">
                <h4>What This Means:</h4>
                <div class="explanation-grid">
                  <div class="explanation-item"><div class="explanation-text"><strong>LCC = "Lack" of Capacity</strong><p>INFORM uses the inverse: Strong capacity = Low LCC</p></div></div>
                  <div class="explanation-item"><div class="explanation-text"><strong>Counterbalances Vulnerability</strong><p>High capacity can offset high vulnerability</p></div></div>
                  <div class="explanation-item"><div class="explanation-text"><strong>Can Be Strengthened</strong><p>Investment in systems and infrastructure reduces LCC and risk</p></div></div>
                  <div class="explanation-item"><div class="explanation-text"><strong>Determines Crisis vs Management</strong><p>Capacity decides if a hazard overwhelms the country</p></div></div>
                </div>
                <div class="formula-note"><strong>One more dimension to go!</strong> Section 6 will reveal (H and E) - Hazard and Exposure - completing the full INFORM Risk equation.</div>
              </div>
            </div>
          }
        </div>

        <div class="teaching-box capacity-teaching">
          <div class="teaching-content">
            <h3>KEY INSIGHT: Coping Capacity Counterbalances Vulnerability</h3>
            <div class="teaching-scenario">
              <div class="scenario-title">Scenario: High Vulnerability District</div>
              <div class="scenario-comparison">
                <div class="scenario-side without">
                  <h4>WITHOUT Strong Coping Capacity:</h4>
                  <div class="scenario-outcomes">
                    <div class="outcome-item"><span class="outcome-text">Drought &#8594; <strong>Famine</strong></span></div>
                    <div class="outcome-item"><span class="outcome-text">Epidemic &#8594; <strong>Mass Deaths</strong></span></div>
                    <div class="outcome-item"><span class="outcome-text">Flood &#8594; <strong>Displacement</strong></span></div>
                  </div>
                </div>
                <div class="scenario-divider">&#8594;</div>
                <div class="scenario-side with">
                  <h4>WITH Strong Coping Capacity:</h4>
                  <div class="scenario-outcomes">
                    <div class="outcome-item"><span class="outcome-text">Drought &#8594; <strong>Managed food distribution</strong></span></div>
                    <div class="outcome-item"><span class="outcome-text">Epidemic &#8594; <strong>Controlled outbreak</strong></span></div>
                    <div class="outcome-item"><span class="outcome-text">Flood &#8594; <strong>Safe evacuation</strong></span></div>
                  </div>
                </div>
              </div>
              <div class="scenario-conclusion">
                <strong>&#8594; Investing in capacity = Risk reduction</strong>
                <p>This is why Tanzania's investments in early warning systems, emergency services, and health infrastructure directly reduce disaster risk.</p>
              </div>
            </div>
          </div>
        </div>

        <div class="summary-purple">
          <h3>Section 5 Summary: Key Learnings</h3>
          <div class="summary-points">
            <div class="summary-point"><span class="check-icon"></span><span class="point-text"><strong>Coping capacity</strong> is the ability to prepare, respond, and recover from disasters</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">INFORM measures capacity through <strong>three components</strong>: institutional, infrastructure, and health</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text"><strong>Strong capacity counterbalances vulnerability</strong> - the same vulnerable population can avoid crisis with good coping systems</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">The INFORM formula uses <strong>Lack of Coping Capacity (LCC)</strong> as the second dimension of risk</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text"><strong>Investing in capacity = Risk reduction</strong> - every improvement in systems and infrastructure saves lives</span></div>
          </div>
          <div class="next-section-preview">
            <h4>Final Section: Risk</h4>
            <p>You've learned about <strong>Hazard and Exposure</strong>, <strong>Vulnerability</strong>, and <strong>Coping Capacity</strong>. Section 6 brings it all together - the <strong>complete INFORM Risk formula</strong>, how to calculate risk scores, and how Tanzania uses this framework for decision-making.</p>
          </div>
        </div>
      </div>
    </ng-template>

    <!-- ============ SECTION 6: RISK ============ -->
    <ng-template #sec6>
      <div class="section6-risk">
        <div class="section-header">
          <h1>Section 6: Risk</h1>
          <p class="section-subtitle">Putting It All Together</p>
        </div>

        <div class="definition-box risk-definition">
          <div class="definition-content">
            <h3>What is Risk?</h3>
            <p class="inform-definition-p"><strong>INFORM Definition:</strong> Risk is the combination of hazard, exposure, vulnerability, and lack of coping capacity. It represents the potential for humanitarian crises requiring international assistance.</p>
            <p class="definition-explanation">Risk is NOT random or unpredictable - it can be <strong>measured, compared, and reduced</strong>. The INFORM Risk Index provides a scientific framework for understanding and addressing disaster risk.</p>
            <div class="risk-emphasis"><strong>Critical Point:</strong> Risk is calculable and manageable. By addressing its components (reducing vulnerability, strengthening coping capacity), we can prevent future disasters.</div>
          </div>
        </div>

        <div class="formula-reveal-section complete">
          <div class="reveal-intro">
            <h2>The Complete INFORM Risk Equation</h2>
            <p>You've learned about <strong>Hazard and Exposure</strong>, <strong>Vulnerability</strong>, and <strong>Coping Capacity</strong>. Now see how INFORM combines all three dimensions into a single, comparable risk score.</p>
            <button class="reveal-button" (click)="s6ShowCompleteFormula.set(!s6ShowCompleteFormula())" [style.backgroundColor]="s6ShowCompleteFormula() ? '#43A047' : '#1976D2'">
              {{ s6ShowCompleteFormula() ? 'Complete Formula Revealed' : 'Click to Reveal Complete INFORM Formula' }}
            </button>
          </div>
          @if (s6ShowCompleteFormula()) {
            <div class="formula-box complete-formula">
              <div class="formula-title">THE COMPLETE INFORM RISK EQUATION</div>
              <div class="formula-equation large"><div class="formula-text">Risk = (H and E)<sup>1/3</sup> &times; (V)<sup>1/3</sup> &times; (LCC)<sup>1/3</sup></div></div>
              <div class="formula-highlights-complete">
                <div class="formula-highlight hazard"><div class="highlight-arrow"></div><div class="highlight-label">HAZARD and EXPOSURE</div><div class="highlight-description">What hazards + Who is exposed</div></div>
                <div class="formula-highlight vulnerability"><div class="highlight-arrow"></div><div class="highlight-label">VULNERABILITY</div><div class="highlight-description">Pre-existing susceptibility</div></div>
                <div class="formula-highlight capacity"><div class="highlight-arrow"></div><div class="highlight-label">LACK OF COPING CAPACITY</div><div class="highlight-description">Inability to manage disasters</div></div>
              </div>
              <div class="formula-explanation complete">
                <h4>Why the Geometric Mean (Cube Root)?</h4>
                <div class="geometric-comparison">
                  <div class="comparison-col problem">
                    <div class="comparison-title">Arithmetic Mean (Average)</div>
                    <div class="comparison-formula">Risk = (H and E + V + LCC) &divide; 3</div>
                    <div class="comparison-problem"><strong>Problem:</strong> High score in one dimension can be "cancelled out" by low scores in others</div>
                    <div class="comparison-example">Example: H and E=9, V=1, LCC=1 &#8594; Risk = 3.7 (appears moderate, but high hazard!)</div>
                  </div>
                  <div class="comparison-col benefit">
                    <div class="comparison-title">Geometric Mean (Cube Root)</div>
                    <div class="comparison-formula">Risk = (H and E &times; V &times; LCC)<sup>1/3</sup></div>
                    <div class="comparison-benefit"><strong>Benefit:</strong> ALL dimensions matter equally - a high score in any dimension raises overall risk</div>
                    <div class="comparison-example">Same example: H and E=9, V=1, LCC=1 &#8594; Risk = 2.1 (low, accurately reflects low V and LCC)</div>
                  </div>
                </div>
                <div class="geometric-insight"><strong>Key Insight:</strong> The geometric mean ensures that reducing risk requires addressing ALL dimensions. You cannot have low risk if vulnerability is high, even if coping capacity is strong.</div>
              </div>
            </div>
          }
        </div>

        <div class="tanzania-risk-section">
          <h2>Tanzania's INFORM Risk Score</h2>
          <p class="section-intro">Based on the INFORM methodology, here is Tanzania's current disaster risk profile:</p>
          <div class="risk-score-card">
            <div class="score-main" [style.borderColor]="TANZANIA_RISK.classificationColor">
              <div class="score-label">Tanzania INFORM Risk Score</div>
              <div class="score-value" [style.color]="TANZANIA_RISK.classificationColor">{{ TANZANIA_RISK.overall }}</div>
              <div class="score-classification" [style.backgroundColor]="TANZANIA_RISK.classificationColor">{{ TANZANIA_RISK.classification }}</div>
              <div class="score-rank">{{ TANZANIA_RISK.rank }}</div>
            </div>
            <div class="dimensions-breakdown">
              <h4>Dimension Breakdown</h4>
              <div class="dimension-bars">
                <div class="dimension-bar">
                  <div class="dimension-label"><span>Hazard and Exposure</span></div>
                  <div class="dimension-value-bar"><div class="dimension-fill hazard" [style.width]="pct(TANZANIA_RISK.dimensions.hazardExposure)"><span class="dimension-score">{{ TANZANIA_RISK.dimensions.hazardExposure }}</span></div></div>
                </div>
                <div class="dimension-bar">
                  <div class="dimension-label"><span>Vulnerability</span></div>
                  <div class="dimension-value-bar"><div class="dimension-fill vulnerability" [style.width]="pct(TANZANIA_RISK.dimensions.vulnerability)"><span class="dimension-score">{{ TANZANIA_RISK.dimensions.vulnerability }}</span></div></div>
                </div>
                <div class="dimension-bar">
                  <div class="dimension-label"><span>Lack of Coping Capacity</span></div>
                  <div class="dimension-value-bar"><div class="dimension-fill capacity" [style.width]="pct(TANZANIA_RISK.dimensions.lackCoping)"><span class="dimension-score">{{ TANZANIA_RISK.dimensions.lackCoping }}</span></div></div>
                </div>
              </div>
              <div class="calculation-display">
                <div class="calculation-formula">Risk = ({{ TANZANIA_RISK.dimensions.hazardExposure }} &times; {{ TANZANIA_RISK.dimensions.vulnerability }} &times; {{ TANZANIA_RISK.dimensions.lackCoping }})<sup>1/3</sup> = <strong>{{ TANZANIA_RISK.overall }}</strong></div>
              </div>
            </div>
          </div>
          <div class="context-box"><div class="context-text"><strong>What This Means:</strong> {{ TANZANIA_RISK.context }}</div></div>
        </div>

        <div class="classification-section">
          <h2>INFORM Risk Classification</h2>
          <p class="section-intro">INFORM scores range from 0 (no risk) to 10 (maximum risk), divided into five levels:</p>
          <div class="risk-levels-table">
            @for (level of RISK_LEVELS; track level.level) {
              <div class="risk-level-row" [class.current]="TANZANIA_RISK.classification === level.level" [style.borderColor]="level.color">
                <div class="level-color" [style.backgroundColor]="level.color"></div>
                <div class="level-info"><div class="level-name">{{ level.level }}</div><div class="level-range">{{ level.range }}</div></div>
                <div class="level-description">{{ level.description }}</div>
                @if (TANZANIA_RISK.classification.includes(level.level)) { <div class="current-indicator">Tanzania is here</div> }
              </div>
            }
          </div>
        </div>

        <div class="comparison-section">
          <h2>How Does Tanzania Compare?</h2>
          <div class="comparison-controls">
            <button class="comparison-tab" [class.active]="s6Comparison() === 'regional'" (click)="s6Comparison.set('regional')">Regional Comparison</button>
            <button class="comparison-tab" [class.active]="s6Comparison() === 'dimensional'" (click)="s6Comparison.set('dimensional')">Dimension Comparison</button>
          </div>
          @if (s6Comparison() === 'regional') {
            <div class="comparison-content">
              <div class="comparison-bars">
                @for (item of REGIONAL_COMPARISONS; track item.region) {
                  <div class="comparison-bar-row">
                    <div class="comparison-label">{{ item.region }}</div>
                    <div class="comparison-bar-container"><div class="comparison-bar-fill" [style.width]="pct(item.score)" [style.backgroundColor]="item.color"><span class="comparison-score">{{ item.score }}</span></div></div>
                  </div>
                }
              </div>
              <div class="comparison-insight"><strong>Insight:</strong> Tanzania's risk (4.2) is below the East Africa average (4.8) but above the Southern Africa and global averages. This reflects moderate hazard exposure but elevated vulnerability relative to coping capacity.</div>
            </div>
          }
          @if (s6Comparison() === 'dimensional') {
            <div class="comparison-content">
              <div class="dimension-comparison-grid">
                @for (item of DIMENSION_COMPARISONS; track item.dimension) {
                  <div class="dimension-comparison-card">
                    <div class="dimension-card-header" [style.backgroundColor]="item.color">{{ item.dimension }}</div>
                    <div class="dimension-card-body">
                      <div class="dimension-score-row"><span class="score-label">Tanzania:</span><span class="score-value" [style.color]="item.color">{{ item.tanzania }}</span></div>
                      <div class="dimension-score-row"><span class="score-label">East Africa:</span><span class="score-value">{{ item.eastAfrica }}</span></div>
                      <div class="dimension-score-row"><span class="score-label">Global:</span><span class="score-value">{{ item.global }}</span></div>
                    </div>
                  </div>
                }
              </div>
              <div class="comparison-insight"><strong>Key Finding:</strong> Tanzania's vulnerability (5.1) is the highest dimension, exceeding both regional and global averages. This indicates that addressing socio-economic factors and vulnerable populations should be a priority for risk reduction.</div>
            </div>
          }
        </div>

        <div class="scenario-section">
          <h2>Scenario Analysis: "What If?"</h2>
          <p class="section-intro">Explore how changes to each dimension affect overall risk. Adjust the sliders to see how interventions in different areas could reduce Tanzania's risk score.</p>
          <div class="scenario-tool">
            <div class="scenario-controls">
              <div class="scenario-slider">
                <label><span class="slider-label">Hazard and Exposure</span></label>
                <input type="range" min="0" max="10" step="0.1" [value]="s6HE()" (input)="onSlider('he', $event)" class="slider hazard" />
                <span class="slider-value">{{ s6HE().toFixed(1) }}</span>
              </div>
              <div class="scenario-slider">
                <label><span class="slider-label">Vulnerability</span></label>
                <input type="range" min="0" max="10" step="0.1" [value]="s6V()" (input)="onSlider('v', $event)" class="slider vulnerability" />
                <span class="slider-value">{{ s6V().toFixed(1) }}</span>
              </div>
              <div class="scenario-slider">
                <label><span class="slider-label">Lack of Coping Capacity</span></label>
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
              <div class="scenario-classification" [style.color]="scenarioLevel().color">{{ scenarioLevel().level }} Risk</div>
              <div class="scenario-description">{{ scenarioLevel().description }}</div>
            </div>
            <div class="scenario-examples">
              <h4>Try These Scenarios:</h4>
              <div class="scenario-buttons">
                <button class="scenario-preset-btn" (click)="s6Preset(3.8, 3.0, 3.9)">Reduce Vulnerability<span class="preset-hint">(V: 5.1 &#8594; 3.0)</span></button>
                <button class="scenario-preset-btn" (click)="s6Preset(3.8, 5.1, 2.5)">Strengthen Coping<span class="preset-hint">(LCC: 3.9 &#8594; 2.5)</span></button>
                <button class="scenario-preset-btn" (click)="s6Preset(3.8, 3.0, 2.5)">Combined Interventions<span class="preset-hint">(V and LCC both reduced)</span></button>
                <button class="scenario-preset-btn reset" (click)="s6Preset(3.8, 5.1, 3.9)">Reset to Tanzania Current</button>
              </div>
            </div>
          </div>
        </div>

        <div class="teaching-box risk-manageable">
          <div class="teaching-content">
            <h3>KEY EMPHASIS: Risk is MANAGEABLE, Not Fixed</h3>
            <div class="manageable-grid">
              <div class="manageable-item"><div class="manageable-text"><strong>Risk is Measurable</strong><p>The INFORM formula provides a scientific, comparable way to quantify disaster risk</p></div></div>
              <div class="manageable-item"><div class="manageable-text"><strong>Risk is Transparent</strong><p>Every component is based on observable, verifiable indicators</p></div></div>
              <div class="manageable-item"><div class="manageable-text"><strong>Risk is Reducible</strong><p>We can lower risk by addressing vulnerability and strengthening coping capacity</p></div></div>
              <div class="manageable-item"><div class="manageable-text"><strong>Risk Guides Action</strong><p>Knowing the risk score helps prioritize where to invest in disaster prevention</p></div></div>
            </div>
            <div class="action-pathways">
              <h4>Pathways to Reduce Tanzania's Risk:</h4>
              <div class="pathway-grid">
                <div class="pathway"><strong>Strengthen Health Systems</strong><p>Reduce vulnerability by improving maternal health, nutrition, and disease prevention</p></div>
                <div class="pathway"><strong>Expand Education</strong><p>Reduce vulnerability through literacy, awareness, and understanding of risks</p></div>
                <div class="pathway"><strong>Build Early Warning</strong><p>Reduce lack of coping by implementing multi-hazard early warning systems</p></div>
                <div class="pathway"><strong>Invest in Response</strong><p>Reduce lack of coping through trained emergency services and infrastructure</p></div>
              </div>
            </div>
            <div class="manageable-conclusion"><strong>Bottom Line:</strong> Disasters are NOT inevitable. By understanding and addressing the components of risk, Tanzania can build a safer, more resilient future. Every improvement in vulnerability or coping capacity directly reduces future disaster impacts.</div>
          </div>
        </div>

        <div class="risk-summary">
          <h3>Section 6 Summary: Key Learnings</h3>
          <div class="summary-points">
            <div class="summary-point"><span class="check-icon"></span><span class="point-text"><strong>Risk</strong> is the combination of hazard, exposure, vulnerability, and lack of coping capacity</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">The <strong>INFORM formula</strong> uses a geometric mean to ensure all dimensions matter equally</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">Tanzania's risk score is <strong>4.2 (Medium-High)</strong>, driven primarily by elevated vulnerability</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">Risk is <strong>measurable, transparent, and reducible</strong> - not random or inevitable</span></div>
            <div class="summary-point"><span class="check-icon"></span><span class="point-text">Scenario analysis shows how <strong>targeted interventions</strong> in vulnerability or coping capacity can significantly reduce overall risk</span></div>
          </div>
          <div class="module-completion">
            <h3>Congratulations! You've Completed Module 01</h3>
            <p class="completion-message">You now understand the INFORM Risk Framework and how it applies to Tanzania. You've learned that disasters are not natural - they result from measurable, addressable conditions. Armed with this knowledge, you're ready to explore Tanzania's specific risk profile and early warning systems.</p>
            <div class="next-module-preview">
              <h4>What's Next?</h4>
              <p><strong>Module 02: INFORM Risk Assessment</strong> - Dive into Tanzania's council-level risk data (195 councils across 31 regions), explore hazard maps, and analyze vulnerability and coping capacity indicators.</p>
            </div>
          </div>
        </div>
      </div>
    </ng-template>
  `,
})
export class PublicInformEducationComponent {
  // ===== Course state =====
  readonly SECTIONS = [
    { id: 1, title: 'Hazard', subtitle: 'What Can Happen?' },
    { id: 2, title: 'Exposure', subtitle: "Who is in Harm's Way?" },
    { id: 3, title: 'Sensitivity', subtitle: 'Why Different Impacts?' },
    { id: 4, title: 'Vulnerability', subtitle: 'Why Some Suffer More?' },
    { id: 5, title: 'Coping Capacity', subtitle: 'Can We Manage It?' },
    { id: 6, title: 'Risk', subtitle: 'Combining All Dimensions' },
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
      section: 'Hazard',
      question: 'According to INFORM, what is the key difference between a hazard and a disaster?',
      options: [
        'A hazard is natural, a disaster is human-made',
        'A hazard is a potential threat; a disaster occurs when it affects vulnerable populations',
        'A hazard is small-scale, a disaster is large-scale',
        'A hazard happens rarely, a disaster happens frequently',
      ],
      correct: 1,
      explanation: 'A hazard is just a potential threat (like heavy rainfall). It only becomes a disaster when it impacts exposed and vulnerable populations who cannot cope.',
    },
    2: {
      section: 'Exposure',
      question: 'What is the difference between absolute exposure and relative exposure?',
      options: [
        'Absolute is total population exposed; relative is the percentage of total population exposed',
        'Absolute is for urban areas; relative is for rural areas',
        'Absolute measures hazard intensity; relative measures population density',
        'There is no difference; they mean the same thing',
      ],
      correct: 0,
      explanation: 'Absolute exposure counts the total number of people exposed (e.g., 500,000 people). Relative exposure shows what percentage of the total population is exposed (e.g., 8.5%).',
    },
    3: {
      section: 'Sensitivity',
      question: 'Why do two districts with the same hazard exposure sometimes experience very different outcomes?',
      options: [
        'One district has a larger population',
        'Different sensitivity factors like housing quality, health infrastructure, and economic conditions',
        'One district is closer to the capital city',
        'Random chance and luck',
      ],
      correct: 1,
      explanation: 'Sensitivity factors determine how severely a hazard impacts people. Poor housing, weak health systems, inadequate infrastructure, and economic fragility increase sensitivity to harm.',
    },
    4: {
      section: 'Vulnerability',
      question: 'In the INFORM framework, vulnerability has two main components. What are they?',
      options: [
        'Natural hazards and human hazards',
        'Socio-economic vulnerability and vulnerable groups',
        'Urban vulnerability and rural vulnerability',
        'Short-term vulnerability and long-term vulnerability',
      ],
      correct: 1,
      explanation: 'INFORM measures vulnerability through: (1) Socio-economic conditions (poverty, malnutrition, lack of access to services) and (2) Vulnerable groups (children, elderly, persons with disabilities, displaced populations).',
    },
    5: {
      section: 'Coping Capacity',
      question: 'What are the three phases of disaster management covered in the Lack of Coping Capacity dimension?',
      options: [
        'Warning, Evacuation, Recovery',
        'Prepare, Respond, Recover',
        'Prevention, Mitigation, Adaptation',
        'Risk Assessment, Early Warning, Relief',
      ],
      correct: 1,
      explanation: "INFORM's Lack of Coping Capacity assesses a country's ability to: (1) Prepare before disasters, (2) Respond during emergencies, and (3) Recover after events. Lower capacity means higher risk.",
    },
    6: {
      section: 'Risk',
      question: 'Why does INFORM use a geometric mean instead of an arithmetic mean in the risk formula?',
      options: [
        'Geometric mean is easier to calculate',
        'Geometric mean ensures all three dimensions (H and E, V, LCC) must be addressed; weakness in any dimension significantly affects overall risk',
        'Geometric mean produces lower risk scores',
        'Geometric mean is the international standard for all risk calculations',
      ],
      correct: 1,
      explanation: 'Geometric mean prevents "compensation" - you can\'t offset very high vulnerability with low hazard. All three dimensions matter equally. A weakness in any dimension significantly lowers the overall score, encouraging balanced risk reduction.',
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
      title: 'Natural Hazards', color: '#D32F2F',
      hazards: [
        { id: 'rainfall', name: 'Heavy Rainfall', frequency: 'Annual' },
        { id: 'flood', name: 'Floods (Riverine and Flash)', frequency: 'Seasonal' },
        { id: 'drought', name: 'Drought', frequency: '3-5 years' },
        { id: 'cyclone', name: 'Cyclones', frequency: 'Occasional' },
        { id: 'waves', name: 'Large Waves (Coastal)', frequency: 'Seasonal' },
        { id: 'wildfire', name: 'Wildfires', frequency: 'Dry season' },
        { id: 'temperature', name: 'Extreme Temperatures', frequency: 'Annual' },
        { id: 'heatwave', name: 'Heat Waves', frequency: 'Occasional' },
        { id: 'volcano', name: 'Volcanic Activity', frequency: 'Rare' },
        { id: 'earthquake', name: 'Earthquakes', frequency: 'Rare' },
        { id: 'landslide', name: 'Landslides', frequency: 'Rainy season' },
      ],
    },
    human: {
      title: 'Human Hazards', color: '#C62828',
      hazards: [
        { id: 'conflict', name: 'Conflict and Unrest', frequency: 'Variable' },
        { id: 'epidemic', name: 'Epidemics and Disease Outbreaks', frequency: 'Variable' },
      ],
    },
  };
  s1CategoryKeys = Object.keys(this.HAZARD_CATEGORIES);
  s1CurrentCategory = computed(() => this.HAZARD_CATEGORIES[this.s1Category()]);
  s1SelectCategory(k: 'natural' | 'human'): void { this.s1Category.set(k); this.s1SelectedHazard.set(null); }
  s1HazardStatus(id: string): string {
    return id === 'epidemic' ? 'Recently occurred (COVID-19, Cholera)' :
      id === 'flood' ? 'Seasonal threat (Oct-May)' :
      id === 'drought' ? 'Current concern in central regions' :
      'Monitored continuously';
  }
  readonly TIMELINE_YEARS = ['2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];

  // ===== SECTION 2: Exposure =====
  s2SelectedDistrict = signal<any | null>(null);
  s2OverlayStep = signal(0);
  readonly EXPOSURE_DATA = [
    { id: 'dar', name: 'Dar es Salaam', hazardZone: 450, population: 1200000, totalPopulation: 1850000, relativeExposure: 65, hazardType: 'Flood', description: 'Coastal flooding and riverine flooding zones' },
    { id: 'dodoma', name: 'Dodoma', hazardZone: 200, population: 150000, totalPopulation: 600000, relativeExposure: 25, hazardType: 'Flood', description: 'Seasonal riverine flooding' },
    { id: 'mwanza', name: 'Mwanza', hazardZone: 320, population: 450000, totalPopulation: 900000, relativeExposure: 50, hazardType: 'Flood', description: 'Lake Victoria flooding zones' },
    { id: 'arusha', name: 'Arusha', hazardZone: 180, population: 280000, totalPopulation: 700000, relativeExposure: 40, hazardType: 'Volcanic', description: 'Mt. Meru volcanic hazard zone' },
    { id: 'morogoro', name: 'Morogoro', hazardZone: 290, population: 380000, totalPopulation: 950000, relativeExposure: 40, hazardType: 'Flood', description: 'Riverine and flash flooding' },
    { id: 'mbeya', name: 'Mbeya', hazardZone: 150, population: 210000, totalPopulation: 700000, relativeExposure: 30, hazardType: 'Landslide', description: 'Highland landslide zones' },
  ];
  readonly OVERLAY_STEPS = [
    { id: 0, title: 'Step 1: Hazard Zone', description: 'Areas where hazards can occur', color: '#D32F2F' },
    { id: 1, title: 'Step 2: Population', description: 'Where people live and work', color: '#1976D2' },
    { id: 2, title: 'Step 3: Exposure', description: 'Overlap = People in hazard zones', color: '#F57C00' },
  ];
  fmtNum(n: number): string { return n.toLocaleString(); }
  hazardBadgeColor(t: string): string { return t === 'Flood' ? '#D32F2F' : t === 'Volcanic' ? '#795548' : '#FF9800'; }

  // ===== SECTION 3: Sensitivity =====
  s3Selected = signal<'districtA' | 'districtB' | 'both'>('both');
  s3Factor = signal<any | null>(null);
  readonly CASE_STUDY: any = {
    districtA: {
      name: 'District A', flood: '100mm rainfall in 24 hours',
      housing: { type: 'Poor Housing', details: '75% mud/thatch construction, weak foundations' },
      health: { type: 'Weak Health', details: '45% child malnutrition, limited healthcare access' },
      infrastructure: { type: 'No Drainage', details: 'No drainage system, dirt roads' },
      economic: { type: 'High Poverty', details: '60% below poverty line, low income diversity' },
      outcome: 'HIGH IMPACT', outcomeType: 'Disaster', outcomeColor: '#D32F2F',
      outcomeDetails: '500 families displaced, 12 deaths, extensive property damage, disease outbreak',
    },
    districtB: {
      name: 'District B', flood: '100mm rainfall in 24 hours',
      housing: { type: 'Strong Housing', details: '80% concrete/permanent construction, proper foundations' },
      health: { type: 'Good Health', details: '10% child malnutrition, good healthcare access' },
      infrastructure: { type: 'Good Drainage', details: 'Modern drainage system, paved roads' },
      economic: { type: 'Lower Poverty', details: '20% below poverty line, diverse livelihoods' },
      outcome: 'LOW IMPACT', outcomeType: 'Manageable', outcomeColor: '#43A047',
      outcomeDetails: 'Minor flooding, no deaths, limited property damage, quick recovery',
    },
  };
  readonly SENSITIVITY_FACTORS = [
    { id: 'housing', name: 'Housing Quality', color: '#FF9800',
      indicators: [ { label: 'Mud/thatch housing', value: '45%', risk: 'high' }, { label: 'Concrete/permanent housing', value: '35%', risk: 'medium' }, { label: 'Improved housing', value: '20%', risk: 'low' } ],
      description: 'Poor housing collapses easily during floods, landslides, and earthquakes',
      tanzaniaNote: 'Rural areas have 65% traditional housing vs 20% in urban centers' },
    { id: 'health', name: 'Health Status', color: '#E91E63',
      indicators: [ { label: 'Child malnutrition (under-5)', value: '31%', risk: 'high' }, { label: 'Access to healthcare', value: '55%', risk: 'medium' }, { label: 'Disease prevalence (malaria)', value: '40%', risk: 'high' } ],
      description: 'Malnourished and sick people are more likely to die during droughts and epidemics',
      tanzaniaNote: 'Coastal regions show higher disease prevalence due to climate conditions' },
    { id: 'infrastructure', name: 'Infrastructure', color: '#3F51B5',
      indicators: [ { label: 'Drainage systems', value: '30%', risk: 'high' }, { label: 'All-weather roads', value: '45%', risk: 'medium' }, { label: 'Clean water access', value: '62%', risk: 'medium' } ],
      description: 'Poor drainage amplifies flood impacts; bad roads isolate communities during crises',
      tanzaniaNote: 'Infrastructure quality varies greatly between regions' },
    { id: 'economic', name: 'Economic Status', color: '#4CAF50',
      indicators: [ { label: 'Below poverty line', value: '26%', risk: 'high' }, { label: 'Livelihood diversity', value: '40%', risk: 'medium' }, { label: 'Savings/assets', value: '25%', risk: 'high' } ],
      description: 'Poor families cannot afford to evacuate, rebuild, or recover from disasters',
      tanzaniaNote: 'Agricultural dependency increases drought sensitivity' },
  ];
  s3ToggleFactor(f: any): void { this.s3Factor.set(this.s3Factor()?.id === f.id ? null : f); }
  s3FactorList(d: any): any[] { return [d.housing, d.health, d.infrastructure, d.economic]; }

  // ===== SECTION 4: Vulnerability =====
  s4Category = signal<'socioeconomic' | 'groups'>('socioeconomic');
  s4Group = signal<any | null>(null);
  s4ShowFormula = signal(false);
  readonly SOCIOECONOMIC_INDICATORS = [
    { id: 'poverty', category: 'Poverty and Deprivation', color: '#D32F2F',
      indicators: [ { name: 'Below poverty line', value: '26%', severity: 'high' }, { name: 'Asset ownership', value: '35%', severity: 'medium' }, { name: 'Income inequality (Gini)', value: '0.41', severity: 'high' } ],
      impact: 'Poor families cannot afford evacuation, safe housing, or recovery costs' },
    { id: 'food', category: 'Food Security', color: '#E65100',
      indicators: [ { name: 'Child malnutrition (stunting)', value: '31%', severity: 'high' }, { name: 'Food production index', value: '95', severity: 'medium' }, { name: 'Drought-affected ag areas', value: '45%', severity: 'high' } ],
      impact: 'Malnourished populations are more likely to die during droughts and famines' },
    { id: 'health', category: 'Health Systems', color: '#C2185B',
      indicators: [ { name: 'Maternal mortality (per 100k)', value: '524', severity: 'high' }, { name: 'Disease burden (DALYs)', value: 'High', severity: 'high' }, { name: 'Access to healthcare', value: '55%', severity: 'medium' } ],
      impact: 'Weak health systems cannot handle epidemic outbreaks or mass casualties' },
    { id: 'education', category: 'Education', color: '#7B1FA2',
      indicators: [ { name: 'Adult literacy rate', value: '78%', severity: 'medium' }, { name: 'Primary school enrollment', value: '85%', severity: 'medium' }, { name: 'Secondary completion', value: '32%', severity: 'high' } ],
      impact: 'Low education limits understanding of warnings and disaster preparedness' },
    { id: 'water', category: 'Water and Sanitation', color: '#1976D2',
      indicators: [ { name: 'Access to clean water', value: '62%', severity: 'medium' }, { name: 'Improved sanitation', value: '32%', severity: 'high' }, { name: 'Handwashing facilities', value: '40%', severity: 'high' } ],
      impact: 'Poor WASH increases disease spread during floods and epidemics' },
  ];
  readonly VULNERABLE_GROUPS = [
    { id: 'children', name: 'Children Under 5', color: '#FF9800', population: '15%', count: '9 million',
      whyVulnerable: [ 'Physical weakness and dependency on adults', 'Higher malnutrition rates (31% stunting)', 'More susceptible to diseases and dehydration', 'Cannot evacuate independently' ],
      tanzaniaContext: 'High birth rates maintain large under-5 population across all regions' },
    { id: 'elderly', name: 'Elderly (65+)', color: '#795548', population: '4%', count: '2.4 million',
      whyVulnerable: [ 'Mobility limitations during evacuations', 'Chronic health conditions worsen in crises', 'Limited income and savings for recovery', 'Social isolation in rural areas' ],
      tanzaniaContext: 'Growing elderly population as life expectancy increases' },
    { id: 'pwd', name: 'Persons with Disabilities', color: '#3F51B5', population: '7%', count: '4.2 million',
      whyVulnerable: [ 'Physical barriers to evacuation and shelters', 'Limited access to warning information', 'Higher dependence on others for safety', 'Often excluded from relief distribution' ],
      tanzaniaContext: 'Underreported; actual prevalence likely higher due to stigma' },
    { id: 'displaced', name: 'Displaced Populations', color: '#F44336', population: 'Variable', count: '~500,000 (refugees + IDPs)',
      whyVulnerable: [ 'Loss of assets and livelihoods', 'Living in temporary, hazard-prone areas', 'Limited access to services', 'Weak social networks for support' ],
      tanzaniaContext: 'Hosts refugees from Burundi, DRC; internal displacement from floods/droughts' },
  ];
  s4ToggleGroup(g: any): void { this.s4Group.set(this.s4Group()?.id === g.id ? null : g); }

  // ===== SECTION 5: Coping =====
  s5Phase = signal<'all' | 'prepare' | 'respond' | 'recover'>('all');
  s5Component = signal<any | null>(null);
  s5ShowFormula = signal(false);
  s5ComparisonView = signal<'both' | 'high' | 'low'>('both');
  readonly COPING_PHASES = [
    { id: 'prepare', name: 'PREPARE', color: '#1976D2', description: 'Actions taken before a disaster to reduce impact',
      activities: [ 'Early warning systems', 'Hazard mapping and planning', 'Community training and drills', 'Emergency supply stockpiling', 'Building codes and land-use planning' ] },
    { id: 'respond', name: 'RESPOND', color: '#D32F2F', description: 'Actions during and immediately after a disaster',
      activities: [ 'Emergency services deployment', 'Search and rescue operations', 'Medical response and triage', 'Relief distribution (food, water, shelter)', 'Coordination and communication' ] },
    { id: 'recover', name: 'RECOVER', color: '#43A047', description: 'Actions to rebuild and strengthen after a disaster',
      activities: [ 'Reconstruction of infrastructure', 'Livelihood restoration', 'Psychosocial support', 'Learning from the disaster', '"Build back better" improvements' ] },
  ];
  readonly PHASE_TABS = [ { id: 'all', label: 'All Phases' }, { id: 'prepare', label: 'Prepare' }, { id: 'respond', label: 'Respond' }, { id: 'recover', label: 'Recover' } ];
  readonly CAPACITY_COMPONENTS = [
    { id: 'institutional', name: 'Institutional Capacity', color: '#3F51B5', description: 'Government systems and disaster management structures',
      indicators: [ { name: 'National DRM Authority (PMO-DMD)', status: 'exists', level: 'good' }, { name: 'District Disaster Committees', status: '154 districts', level: 'medium' }, { name: 'DRR budget allocation', status: '0.8% of budget', level: 'low' }, { name: 'Emergency response SOPs', status: 'Partial', level: 'medium' } ],
      tanzaniaNote: 'Strong frameworks exist but funding and implementation gaps persist' },
    { id: 'infrastructure', name: 'Infrastructure', color: '#FF9800', description: 'Physical systems for communication, transport, and services',
      indicators: [ { name: 'Early warning system coverage', status: '45% of at-risk areas', level: 'medium' }, { name: 'All-season road access', status: '55% of districts', level: 'medium' }, { name: 'Mobile network coverage', status: '85% population', level: 'good' }, { name: 'Emergency shelters', status: '120 facilities', level: 'low' } ],
      tanzaniaNote: 'Urban areas well-covered; rural and remote areas face significant gaps' },
    { id: 'health', name: 'Health Services', color: '#E91E63', description: 'Medical capacity to handle mass casualties and epidemics',
      indicators: [ { name: 'Hospitals per 100k people', status: '2.5', level: 'low' }, { name: 'Ambulance availability', status: '1 per 50k people', level: 'low' }, { name: 'Blood bank capacity', status: '60% of need', level: 'medium' }, { name: 'Disease surveillance system', status: 'Active', level: 'good' } ],
      tanzaniaNote: 'Surveillance strong, but physical capacity (beds, equipment) is limited' },
  ];
  readonly COMPARISON_SCENARIOS: any = {
    high: { title: 'District with HIGH Coping Capacity', color: '#43A047',
      examples: [
        { hazard: 'Flood (100mm rainfall)', outcome: 'Managed Situation', details: [ 'Early warning issued 24h in advance', 'Pre-positioned supplies distributed', 'Vulnerable populations evacuated to shelters', 'Minor damage, no deaths, quick recovery' ] },
        { hazard: 'Disease Outbreak', outcome: 'Controlled Response', details: [ 'Surveillance detected outbreak early', 'Isolation facilities activated', 'Medical teams deployed within hours', 'Outbreak contained in 2 weeks' ] },
      ] },
    low: { title: 'District with LOW Coping Capacity', color: '#D32F2F',
      examples: [
        { hazard: 'Flood (100mm rainfall)', outcome: 'CRISIS', details: [ 'No warning system - people caught off guard', 'No evacuation plan or shelters', 'Roads cut off, no emergency access', 'Major damage, deaths, prolonged displacement' ] },
        { hazard: 'Disease Outbreak', outcome: 'CRISIS', details: [ 'Outbreak detected after widespread transmission', 'No isolation capacity or treatment supplies', 'Medical staff overwhelmed', 'High mortality, prolonged epidemic' ] },
      ] },
  };
  readonly COMPARISON_VIEWS = [ { id: 'both', label: 'Compare Both' }, { id: 'high', label: 'High Capacity' }, { id: 'low', label: 'Low Capacity' } ];
  s5VisiblePhases = computed(() => this.s5Phase() === 'all' ? this.COPING_PHASES : this.COPING_PHASES.filter(p => p.id === this.s5Phase()));
  s5ToggleComponent(c: any): void { this.s5Component.set(this.s5Component()?.id === c.id ? null : c); }

  // ===== SECTION 6: Risk =====
  s6ShowCompleteFormula = signal(false);
  s6Comparison = signal<'regional' | 'dimensional'>('regional');
  s6HE = signal(3.8);
  s6V = signal(5.1);
  s6LCC = signal(3.9);
  readonly TANZANIA_RISK = {
    overall: 4.2, classification: 'Medium-High Risk', classificationColor: '#FF9800',
    dimensions: { hazardExposure: 3.8, vulnerability: 5.1, lackCoping: 3.9 },
    rank: '78 out of 191 countries',
    context: 'Tanzania faces medium-high disaster risk due to elevated vulnerability despite moderate hazard exposure',
  };
  readonly RISK_LEVELS = [
    { level: 'Very Low', range: '0.0 - 2.0', color: '#4CAF50', description: 'Minimal disaster risk' },
    { level: 'Low', range: '2.0 - 3.5', color: '#8BC34A', description: 'Limited disaster risk' },
    { level: 'Medium', range: '3.5 - 5.0', color: '#FFC107', description: 'Moderate disaster risk' },
    { level: 'High', range: '5.0 - 6.5', color: '#FF9800', description: 'Significant disaster risk' },
    { level: 'Very High', range: '6.5 - 10.0', color: '#D32F2F', description: 'Severe disaster risk' },
  ];
  readonly REGIONAL_COMPARISONS = [
    { region: 'Tanzania', score: 4.2, color: '#FF9800' },
    { region: 'East Africa Average', score: 4.8, color: '#FF5722' },
    { region: 'Southern Africa Average', score: 3.6, color: '#FFC107' },
    { region: 'Global Average', score: 3.9, color: '#9E9E9E' },
  ];
  readonly DIMENSION_COMPARISONS = [
    { dimension: 'Hazard and Exposure', tanzania: 3.8, eastAfrica: 4.1, global: 3.5, color: '#D32F2F' },
    { dimension: 'Vulnerability', tanzania: 5.1, eastAfrica: 5.5, global: 4.2, color: '#E65100' },
    { dimension: 'Lack of Coping Capacity', tanzania: 3.9, eastAfrica: 4.6, global: 3.8, color: '#1976D2' },
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
}

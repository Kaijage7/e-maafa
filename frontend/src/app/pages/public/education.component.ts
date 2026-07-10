import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PortalLabels } from './portal-i18n';
import { PortalDataService, HazardCard } from './portal-data.service';

interface EduItem {
  id: number; title: string; contentType: string; summary: string; fullContent?: string;
  author: string; targetAudience: string; publicationDate: string; keywords?: string;
  // Optional Swahili authoring from educational_contents.title_sw / summary_sw / full_content_sw.
  titleSw?: string; summarySw?: string; fullContentSw?: string;
}

/**
 * Public education portal ("/education", "/education/:id") — reproduces
 * portal/educational_contents (index + show): published guidelines, bulletins and
 * articles managed in Content Management → Educational Content.
 */
@Component({
  selector: 'public-education',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="v2-page-content edu-wrap">
      <a routerLink="/" class="edu-back"><i class="fas fa-arrow-left me-1"></i> {{ L.t('lbl_home') }}</a>

      @if (item(); as it) {
        <!-- ===== Detail view (measure capped for reading comfort, not a layout cap) ===== -->
        <article class="edu-detail">
          <span class="art-type">{{ it.contentType }}</span>
          <h1 class="edu-detail-title">{{ eduTitle(it) }}</h1>
          <div class="edu-detail-meta">
            @if (it.author) { <span><i class="fas fa-user me-1"></i>{{ it.author }}</span> }
            @if (it.publicationDate) { <span><i class="fas fa-clock me-1"></i>{{ it.publicationDate }}</span> }
            @if (it.targetAudience) { <span><i class="fas fa-users me-1"></i>{{ it.targetAudience }}</span> }
            <span><i class="fas fa-book-open me-1"></i>{{ readMins(it) }} {{ L.lang() === 'sw' ? 'dakika za kusoma' : 'min read' }}</span>
          </div>
          <button type="button" class="edu-btn-outline" (click)="printPage()">
            <i class="fas fa-print"></i> {{ L.lang() === 'sw' ? 'Chapisha / Hifadhi' : 'Print / Save' }}
          </button>
          @if (!eduTitle(it)) {
            <div class="edu-empty" style="margin-top:1rem;">
              <i class="fas fa-language"></i>
              <p>{{ copy(
                'This article is not available in English yet.',
                'Makala hii bado haipatikani kwa Kiswahili.'
              ) }}</p>
            </div>
          } @else {
            @if (eduSummary(it)) { <p class="edu-detail-lede">{{ eduSummary(it) }}</p> }
            @if (eduBody(it)) {
              <div class="edu-detail-body">{{ eduBody(it) }}</div>
            } @else {
              <p class="edu-detail-lede muted">{{ copy(
                'Full text not available in this language.',
                'Maandishi kamili hayapatikani katika lugha hii.'
              ) }}</p>
            }
          }
          <a routerLink="/education" class="edu-back edu-detail-return"><i class="fas fa-arrow-left me-1"></i> {{ L.t('lbl_education') }}</a>
        </article>
      } @else {
        <!-- ===== List view: public learning hub ===== -->
        <header class="edu-head">
          <h1 class="edu-title">{{ L.t('lbl_education') }}</h1>
          <p class="edu-mission">{{ L.t('lbl_hazards_education_subtitle') }}</p>
          <div class="edu-search">
            <i class="fas fa-search"></i>
            <input type="search" [value]="q()" (input)="q.set($any($event.target).value)"
                   [placeholder]="L.lang() === 'sw' ? 'Tafuta mwongozo wa janga au makala…' : 'Search hazard guides and articles…'"
                   [attr.aria-label]="L.lang() === 'sw' ? 'Tafuta maudhui ya elimu' : 'Search education content'">
          </div>
          <div class="edu-stats">
            <span><i class="fas fa-shield-alt me-1"></i><b>{{ hazardCards().length }}</b> {{ L.lang() === 'sw' ? 'miongozo ya majanga' : 'hazard guides' }}</span>
            <span><i class="fas fa-newspaper me-1"></i><b>{{ contents().length }}</b> {{ L.lang() === 'sw' ? 'makala na miongozo' : 'articles & guides' }}</span>
            <span><i class="fas fa-graduation-cap me-1"></i><b>1</b> {{ L.lang() === 'sw' ? 'kozi elekezi' : 'guided course' }}</span>
            <span><i class="fas fa-calendar-days me-1"></i><b>1</b> {{ L.lang() === 'sw' ? 'kalenda ya kitaifa' : 'national calendar' }}</span>
          </div>
        </header>

        <section class="edu-pathway" aria-label="Education pathway">
          <div>
            <div class="edu-path-eyebrow">{{ copy('Learning pathway', 'Mtiririko wa kujifunza') }}</div>
            <h2>{{ copy('From awareness to action', 'Kutoka uelewa hadi hatua') }}</h2>
            <p>{{ copy('Start with the risk framework, move into hazard-specific guidance, then use official articles and materials for community action.', 'Anza na mfumo wa hatari, endelea kwenye mwongozo wa kila janga, kisha tumia makala na nyenzo rasmi kwa hatua za jamii.') }}</p>
          </div>
          <div class="edu-path-steps">
            <a routerLink="/inform-education" class="edu-path-step">
              <b>01</b><span>{{ copy('Understand risk', 'Elewa hatari') }}</span><small>{{ copy('INFORM guided course', 'Kozi elekezi ya INFORM') }}</small>
            </a>
            <a href="#hazard-guides" class="edu-path-step">
              <b>02</b><span>{{ copy('Know hazards', 'Fahamu majanga') }}</span><small>{{ copy('Before, during and after', 'Kabla, wakati na baada') }}</small>
            </a>
            <a routerLink="/hazard-calendar" class="edu-path-step">
              <b>03</b><span>{{ copy('Plan by season', 'Panga kwa msimu') }}</span><small>{{ copy('National hazard calendar', 'Kalenda ya kitaifa ya majanga') }}</small>
            </a>
            <a href="#guides-articles" class="edu-path-step">
              <b>04</b><span>{{ copy('Use official guidance', 'Tumia mwongozo rasmi') }}</span><small>{{ copy('Articles, bulletins and guides', 'Makala, taarifa na miongozo') }}</small>
            </a>
          </div>
        </section>

        <!-- Quick tools that were easy to miss -->
        <div class="edu-tools-row" aria-label="Education tools">
          <a routerLink="/inform-risk" class="edu-tool">
            <i class="fas fa-map-marked-alt"></i>
            <span>{{ copy('Explore INFORM map', 'Chunguza ramani ya INFORM') }}</span>
            <small>{{ copy('Council risk choropleth', 'Hatari kwa halmashauri') }}</small>
          </a>
          <a routerLink="/subscribe" class="edu-tool">
            <i class="fas fa-bell"></i>
            <span>{{ copy('Subscribe to alerts', 'Jisajili kwa tahadhari') }}</span>
            <small>{{ copy('SMS / email free of charge', 'SMS / barua pepe bila malipo') }}</small>
          </a>
          <a routerLink="/portal" class="edu-tool">
            <i class="fas fa-broadcast-tower"></i>
            <span>{{ copy('Live portal', 'Portal ya moja kwa moja') }}</span>
            <small>{{ copy('Active warnings & incidents', 'Tahadhari na matukio yaliyo hai') }}</small>
          </a>
          <a routerLink="/publications/Policies" class="edu-tool">
            <i class="fas fa-file-pdf"></i>
            <span>{{ copy('Policies & frameworks', 'Sera na mifumo') }}</span>
            <small>{{ copy('Official documents', 'Nyaraka rasmi') }}</small>
          </a>
        </div>

        <!-- Featured: the INFORM guided course + the National Hazard Calendar, as equals -->
        <div class="edu-featured">
          <a routerLink="/inform-education" class="edu-feat edu-lift" style="background:#0d3b66;">
            <div class="feat-icon"><i class="fas fa-graduation-cap"></i></div>
            <div class="feat-body">
              <div class="feat-eyebrow">{{ L.t('edu_inform_course_eyebrow') }}</div>
              <div class="feat-title">{{ L.t('edu_inform_course_title') }}</div>
              <div class="feat-desc">{{ L.t('edu_inform_course_desc') }}</div>
            </div>
            <span class="feat-cta" style="color:#0d3b66;">{{ L.t('edu_inform_course_cta') }} <i class="fas fa-arrow-right ms-1"></i></span>
          </a>
          <a routerLink="/hazard-calendar" class="edu-feat edu-lift" style="background:#0369a1;">
            <div class="feat-icon"><i class="fas fa-calendar-days"></i></div>
            <div class="feat-body">
              <div class="feat-eyebrow">{{ L.lang() === 'sw' ? 'Kalenda ya Kitaifa' : 'National Calendar' }}</div>
              <div class="feat-title">{{ L.lang() === 'sw' ? 'Kalenda ya Majanga ya Kitaifa' : 'National Hazard Calendar' }}</div>
              <div class="feat-desc">{{ L.lang() === 'sw' ? 'Majanga yanapotarajiwa zaidi mwaka mzima, mwezi kwa mwezi' : 'When each hazard is most likely across the year, month by month' }}</div>
            </div>
            <span class="feat-cta" style="color:#0369a1;">{{ L.lang() === 'sw' ? 'Fungua kalenda' : 'Open calendar' }} <i class="fas fa-arrow-right ms-1"></i></span>
          </a>
        </div>

        <!-- National threats under watch — with their past impacts to Tanzania -->
        @if (threats().length) {
          <div class="edu-sec-head">
            <h2>{{ L.t('edu_national_threats') }}</h2>
            <p>{{ L.lang() === 'sw' ? 'Vitisho vinavyofuatiliwa kitaifa sasa — na athari zake za nyuma kwa Tanzania' : 'Threats under national watch right now — with their past impacts to Tanzania' }}</p>
          </div>
          <div class="th-grid">
            @for (th of threats(); track th.id) {
              <a [routerLink]="['/threats', th.id]" class="edu-card edu-lift th-card">
                <div class="th-icon" [style.background]="th.severity === 'Emergency' ? '#dc2626' : th.severity === 'Warning' ? '#d97706' : '#2563eb'">
                  <i class="fas fa-satellite-dish"></i>
                </div>
                <div style="min-width:0;flex:1;">
                  <div class="th-name">{{ th.name }} <span class="pp-sev {{ sevClass(th.severity) }}">{{ th.severity }}</span></div>
                  <div class="th-meta">{{ th.sourceAgency }} — {{ L.t('edu_see_past_impacts') }}</div>
                </div>
                <i class="fas fa-chevron-right th-chev"></i>
              </a>
            }
          </div>
        }

        <!-- Hazard guide hubs: one repository per hazard (action guides, videos, materials by audience) -->
        <div class="edu-sec-head" id="hazard-guides">
          <h2>{{ L.t('lbl_know_your_hazards') }}</h2>
          <p>{{ L.lang() === 'sw' ? 'Mwongozo wa kila janga — hatua za kuchukua kabla, wakati na baada' : 'A guide for every hazard — what to do before, during and after' }}</p>
        </div>
        <div class="hz-grid">
          @for (hz of filteredHazards(); track hz.name) {
            <a [routerLink]="['/education/hazard', hz.name]" class="edu-card edu-lift hz-card">
              <div class="hz-icon" [style.background]="hz.color + '1a'" [style.color]="hz.color">
                <i class="fas {{ hz.icon }}"></i>
              </div>
              <div style="min-width:0;">
                <div class="hz-name">{{ hazardName(hz) }}</div>
                @if (hazardDesc(hz)) { <p class="hz-desc">{{ hazardDesc(hz) }}</p> }
                <span class="hz-open" [style.color]="hz.color">{{ L.lang() === 'sw' ? 'Fungua mwongozo' : 'Open guide' }} <i class="fas fa-arrow-right"></i></span>
              </div>
            </a>
          } @empty {
            <div class="edu-empty">
              <i class="fas fa-shield-alt"></i>
              @if (q()) {
                <p>{{ L.lang() === 'sw' ? 'Hakuna mwongozo wa janga unaolingana na "' + q() + '"' : 'No hazard guides match "' + q() + '"' }}</p>
                <button type="button" class="edu-btn-outline" (click)="q.set('')">{{ L.lang() === 'sw' ? 'Futa utafutaji' : 'Clear search' }}</button>
              } @else {
                <p>{{ L.lang() === 'sw' ? 'Miongozo ya majanga inapakiwa…' : 'Hazard guides are loading…' }}</p>
              }
            </div>
          }
        </div>

        <!-- Published guidelines, bulletins and articles -->
        <div class="edu-sec-head" id="guides-articles">
          <h2>{{ L.t('edu_guides_articles') }}</h2>
          <p>{{ L.lang() === 'sw' ? 'Miongozo, taarifa na makala zilizochapishwa na Idara ya Menejimenti ya Maafa' : 'Published guidelines, bulletins and articles from the Disaster Management Department' }}</p>
        </div>
        <div class="edu-content-tools">
          <select [value]="typeF()" (change)="typeF.set($any($event.target).value)">
            <option value="">{{ copy('All content types', 'Aina zote za maudhui') }}</option>
            @for (t of contentTypes(); track t) { <option [value]="t">{{ t }}</option> }
          </select>
          <select [value]="audienceF()" (change)="audienceF.set($any($event.target).value)">
            <option value="">{{ copy('All audiences', 'Hadhira zote') }}</option>
            @for (a of contentAudiences(); track a) { <option [value]="a">{{ a }}</option> }
          </select>
        </div>
        <div class="art-grid">
          @for (c of filteredContents(); track c.id) {
            <a [routerLink]="['/education', c.id]" class="edu-card edu-lift art-card">
              <div class="art-top">
                <span class="art-type">{{ c.contentType }}</span>
                <span class="art-read">{{ readMins(c) }} {{ L.lang() === 'sw' ? 'dakika za kusoma' : 'min read' }}</span>
              </div>
              <div class="art-title">{{ eduTitle(c) }}</div>
              @if (eduSummary(c)) { <p class="art-summary">{{ eduSummary(c) }}</p> }
              <div class="art-meta">
                @if (c.author) { <span><i class="fas fa-user me-1"></i>{{ c.author }}</span> }
                @if (c.publicationDate) { <span><i class="fas fa-clock me-1"></i>{{ c.publicationDate }}</span> }
              </div>
            </a>
          } @empty {
            <div class="edu-empty">
              <i class="fas fa-graduation-cap"></i>
              @if (q()) {
                <p>{{ L.lang() === 'sw' ? 'Hakuna makala inayolingana na "' + q() + '"' : 'No articles match "' + q() + '"' }}</p>
                <button type="button" class="edu-btn-outline" (click)="q.set('')">{{ L.lang() === 'sw' ? 'Futa utafutaji' : 'Clear search' }}</button>
              } @else {
                <p>{{ L.t('edu_no_content_yet') }}</p>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .edu-wrap { max-width: min(1560px, 94vw); margin: 0 auto; padding: 7rem 2rem 4rem; }
    .edu-back { color: #60a5fa; text-decoration: none; font-size: 0.9rem; }

    /* --- Header band --- */
    .edu-head { margin-top: 1rem; }
    .edu-title { font-weight: 800; color: var(--text-primary, #2C3E50); margin: 0; }
    .edu-mission { font-size: 1.05rem; color: var(--text-secondary, #64748b); margin: 0.35rem 0 0; }
    .edu-search { position: relative; max-width: 640px; margin-top: 1.2rem; }
    .edu-search i { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
    .edu-search input { width: 100%; height: 48px; border: 1.5px solid rgba(13, 43, 77, 0.18); border-radius: 10px;
      padding: 0 1rem 0 2.7rem; font-size: 1rem; background: var(--card-bg, #fff); color: var(--text-primary, #2C3E50); }
    .edu-search input:focus { outline: none; border-color: #0d3b66; box-shadow: 0 0 0 3px rgba(13, 59, 102, 0.12); }
    .edu-stats { display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; margin-top: 0.9rem;
      font-size: 0.9rem; color: var(--text-secondary, #64748b); }
    .edu-stats b { color: var(--text-primary, #2C3E50); font-weight: 800; }

    /* --- Quick tools --- */
    .edu-tools-row { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr)); gap:0.75rem; margin-top:1.2rem; }
    .edu-tool { display:flex; flex-direction:column; gap:0.2rem; padding:0.9rem 1rem; border:1px solid rgba(13,43,77,0.12);
      border-radius:10px; background:var(--card-bg,#fff); text-decoration:none; color:var(--text-primary,#2C3E50);
      box-shadow:0 2px 8px rgba(9,30,58,0.05); }
    .edu-tool i { color:#0d3b66; font-size:1.1rem; margin-bottom:0.2rem; }
    .edu-tool span { font-weight:800; font-size:0.95rem; }
    .edu-tool small { color:var(--text-secondary,#64748b); line-height:1.35; }
    .edu-tool:hover { border-color:#0d3b66; background:#eef6ff; }

    /* --- Learning pathway --- */
    .edu-pathway { display:grid; grid-template-columns:minmax(260px, 0.8fr) minmax(0, 1.2fr); gap:1.2rem;
      margin:1.6rem 0 0; padding:1.2rem; border:1px solid rgba(13,43,77,0.12); border-radius:12px;
      background:var(--card-bg,#fff); box-shadow:0 2px 8px rgba(9,30,58,0.05); }
    .edu-path-eyebrow { font-size:0.78rem; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#0d3b66; }
    .edu-pathway h2 { margin:0.2rem 0 0.35rem; font-size:1.35rem; font-weight:800; color:var(--text-primary,#2C3E50); }
    .edu-pathway p { margin:0; color:var(--text-secondary,#64748b); line-height:1.65; }
    .edu-path-steps { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:0.65rem; }
    .edu-path-step { min-height:112px; display:flex; flex-direction:column; gap:0.25rem; justify-content:center;
      padding:0.9rem; border:1px solid rgba(13,43,77,0.12); border-radius:10px; text-decoration:none;
      background:#f8fafc; color:var(--text-primary,#2C3E50); }
    .edu-path-step b { font-size:0.78rem; color:#0d3b66; letter-spacing:0.08em; }
    .edu-path-step span { font-weight:800; line-height:1.25; }
    .edu-path-step small { color:var(--text-secondary,#64748b); line-height:1.35; }
    .edu-path-step:hover { border-color:#0d3b66; background:#eef6ff; }

    /* --- Featured row (flat solids, no gradients) --- */
    .edu-featured { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr)); gap: 1rem; margin: 1.8rem 0 0; }
    .edu-feat { display: flex; flex-wrap: wrap; align-items: center; gap: 1.1rem; color: #fff; border-radius: 12px;
      padding: 1.4rem 1.5rem; text-decoration: none; box-shadow: 0 4px 14px rgba(9, 30, 58, 0.18); }
    .feat-icon { width: 56px; height: 56px; border-radius: 12px; background: rgba(255, 255, 255, 0.16);
      display: flex; align-items: center; justify-content: center; font-size: 1.5rem; flex: none; }
    .feat-body { min-width: 240px; flex: 1; }
    .feat-eyebrow { font-size: 0.8rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85; }
    .feat-title { font-size: 1.2rem; font-weight: 800; margin: 0.15rem 0; }
    .feat-desc { font-size: 0.95rem; opacity: 0.92; }
    .feat-cta { background: #fff; font-weight: 800; font-size: 0.95rem; padding: 0.6rem 1.1rem; border-radius: 8px; white-space: nowrap; flex: none; }

    /* --- Section headers --- */
    .edu-sec-head { margin: 2.75rem 0 1.2rem; }
    .edu-sec-head h2 { font-size: 1.45rem; font-weight: 800; color: var(--text-primary, #2C3E50); margin: 0; }
    .edu-sec-head p { font-size: 1rem; color: var(--text-secondary, #64748b); margin: 0.25rem 0 0; }

    /* --- Shared card base + hover lift --- */
    .edu-card { display: flex; border: 1px solid rgba(13, 43, 77, 0.12); border-radius: 12px;
      background: var(--card-bg, #fff); text-decoration: none; box-shadow: 0 2px 8px rgba(9, 30, 58, 0.05); }
    .edu-lift { transition: transform 0.18s ease, box-shadow 0.18s ease; }
    .edu-lift:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(9, 30, 58, 0.14); }

    /* --- National threats --- */
    .th-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 1fr)); gap: 1rem; }
    .th-card { align-items: center; gap: 14px; padding: 1rem 1.1rem; }
    .th-icon { width: 42px; height: 42px; border-radius: 10px; color: #fff;
      display: flex; align-items: center; justify-content: center; flex: none; }
    .th-name { font-size: 1rem; font-weight: 800; color: var(--text-primary, #2C3E50);
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .th-meta { font-size: 0.9rem; color: var(--text-secondary, #64748b); margin-top: 2px; }
    .th-chev { margin-left: auto; font-size: 0.7rem; color: #94a3b8; flex: none; }
    /* Severity chips — same contract as .pp-sev in portal-landing.css, scoped here. */
    .pp-sev { display: inline-block; font-size: 0.8rem; font-weight: 800; text-transform: uppercase;
      letter-spacing: 0.04em; padding: 2px 10px; border-radius: 999px; }
    .sev-emergency { background: #fde3e3; color: #b51c1c; }
    .sev-warning { background: #ffeede; color: #a85607; }
    .sev-watch { background: #fff7d6; color: #8a6d00; }
    .sev-incident { background: #ece7fb; color: #5b21b6; }

    /* --- Know Your Hazards --- */
    .hz-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); gap: 1rem; }
    .hz-card { align-items: flex-start; gap: 14px; padding: 1.1rem 1.2rem; height: 100%; }
    .hz-icon { width: 46px; height: 46px; border-radius: 12px; display: flex; align-items: center;
      justify-content: center; font-size: 1.15rem; flex: none; }
    .hz-name { font-size: 1.1rem; font-weight: 800; color: var(--text-primary, #2C3E50); }
    .hz-desc { font-size: 0.95rem; line-height: 1.55; color: var(--text-secondary, #64748b); margin: 0.3rem 0 0.55rem;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .hz-open { font-size: 0.9rem; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
    .hz-open i { font-size: 0.7rem; }

    /* --- Guides & Articles --- */
    .art-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr)); gap: 1.1rem; }
    .edu-content-tools { display:flex; flex-wrap:wrap; gap:0.75rem; margin:-0.55rem 0 1rem; }
    .edu-content-tools select { min-height:42px; min-width:190px; border:1.5px solid rgba(13,43,77,0.18);
      border-radius:8px; background:var(--card-bg,#fff); color:var(--text-primary,#2C3E50); padding:0 0.75rem; font:inherit; }
    .art-card { flex-direction: column; gap: 0.6rem; padding: 1.2rem 1.3rem; height: 100%; }
    .art-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .art-type { display: inline-block; background: rgba(0, 51, 102, 0.08); color: #0d3b66; font-size: 0.8rem;
      font-weight: 700; padding: 3px 12px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.04em; }
    .art-read { font-size: 0.85rem; color: #94a3b8; white-space: nowrap; }
    .art-title { font-size: 1.1rem; font-weight: 800; color: var(--text-primary, #2C3E50); line-height: 1.4; }
    .art-summary { font-size: 1rem; color: var(--text-secondary, #64748b); line-height: 1.6; margin: 0; flex: 1;
      display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .art-meta { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 0.85rem; color: #94a3b8; }

    /* --- Empty / no-results states --- */
    .edu-empty { grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-secondary, #64748b);
      border: 1px dashed rgba(13, 43, 77, 0.18); border-radius: 12px; }
    .edu-empty i { font-size: 2.4rem; opacity: 0.3; }
    .edu-empty p { margin: 0.8rem 0 1rem; font-size: 1rem; }

    /* --- Flat outline action button --- */
    .edu-btn-outline { display: inline-flex; align-items: center; gap: 8px; height: 42px; padding: 0 1.1rem;
      border: 1.5px solid #0d3b66; border-radius: 8px; background: transparent; color: #0d3b66;
      font-size: 0.95rem; font-weight: 700; cursor: pointer; }
    .edu-btn-outline:hover { background: rgba(13, 59, 102, 0.06); }

    /* --- Detail view --- */
    .edu-detail { max-width: 920px; margin-top: 1rem; }
    .edu-detail-title { font-weight: 800; color: var(--text-primary, #2C3E50); margin: 0.7rem 0 0.4rem; }
    .edu-detail-meta { display: flex; flex-wrap: wrap; gap: 4px 18px; color: var(--text-secondary, #64748b);
      font-size: 0.9rem; margin-bottom: 1rem; }
    .edu-detail-lede { font-size: 1.05rem; font-weight: 600; color: var(--text-primary, #2C3E50);
      line-height: 1.7; margin-top: 1.2rem; }
    .edu-detail-body { font-size: 1.05rem; color: var(--text-secondary, #475569); line-height: 1.85; white-space: pre-line; }
    .edu-detail-return { display: inline-block; margin-top: 2rem; }

    @media (max-width: 640px) {
      .edu-wrap { padding: 6rem 1rem 2.5rem; }
      .edu-pathway { grid-template-columns:1fr; }
      .edu-path-steps { grid-template-columns:1fr; }
    }
    @media (min-width: 641px) and (max-width: 980px) {
      .edu-pathway { grid-template-columns:1fr; }
      .edu-path-steps { grid-template-columns:repeat(2,minmax(0,1fr)); }
    }
  `],
})
export class EducationComponent {
  L = inject(PortalLabels);
  private http = inject(HttpClient);

  /** UI chrome strings always authored in both languages — never mix. */
  copy(en: string, sw: string): string { return this.L.lang() === 'sw' ? sw : en; }
  eduTitle(c: EduItem): string { return this.pick(c.titleSw, c.title); }
  eduSummary(c: EduItem): string { return this.pick(c.summarySw, c.summary); }
  eduBody(c: EduItem): string { return this.pick(c.fullContentSw, c.fullContent ?? ''); }
  hazardName(hz: HazardCard): string { return this.pick(hz.nameSw, hz.name); }
  hazardDesc(hz: HazardCard): string { return this.pick(hz.descriptionSw, hz.descriptionEn); }
  /**
   * Language isolation: EN mode shows English only; SW mode shows Kiswahili only.
   * No silent cross-language fallback (empty string when the requested edition is missing).
   */
  private pick(sw: string | undefined | null, en: string | undefined | null): string {
    if (this.L.lang() === 'sw') {
      return (sw ?? '').trim();
    }
    return (en ?? '').trim();
  }
  /** True when the visitor-language edition has a title (list filters hide the rest). */
  hasLangEdition(c: EduItem): boolean {
    return this.eduTitle(c).length > 0;
  }
  hasHazardLang(hz: HazardCard): boolean {
    return this.hazardName(hz).length > 0;
  }

  contents = signal<EduItem[]>([]);
  item = signal<EduItem | null>(null);
  /** Hazard hubs surfaced at the top of Elimu (managed in Content Management). */
  hazardCards = signal<HazardCard[]>([]);
  /** National threats — Elimu reflects their past impacts (threat pages carry NDRF-IP figures). */
  threats = signal<{ id: number; name: string; sourceAgency: string; severity: string }[]>([]);

  /** Live search query — filters both the hazard hubs and the articles as the visitor types. */
  q = signal('');
  typeF = signal('');
  audienceF = signal('');
  contentTypes = computed(() => [...new Set(this.contents().map(c => c.contentType).filter(Boolean))].sort());
  contentAudiences = computed(() => [...new Set(this.contents().map(c => c.targetAudience).filter(Boolean))].sort());
  filteredHazards = computed(() => {
    const s = this.q().trim().toLowerCase();
    const lang = this.L.lang();
    return this.hazardCards().filter(h => {
      if (!this.hasHazardLang(h)) return false;
      if (!s) return true;
      // Search only in the active language fields.
      const hay = lang === 'sw'
        ? [h.nameSw, h.descriptionSw]
        : [h.name, h.descriptionEn];
      return hay.some(v => (v ?? '').toLowerCase().includes(s));
    });
  });
  filteredContents = computed(() => {
    const s = this.q().trim().toLowerCase();
    const type = this.typeF();
    const audience = this.audienceF();
    const lang = this.L.lang();
    return this.contents().filter(c => {
      if (!this.hasLangEdition(c)) return false;
      if (type && c.contentType !== type) return false;
      if (audience && c.targetAudience !== audience) return false;
      if (!s) return true;
      const hay = lang === 'sw'
        ? [c.titleSw, c.summarySw, c.contentType, c.targetAudience]
        : [c.title, c.summary, c.contentType, c.targetAudience];
      return hay.some(v => (v ?? '').toLowerCase().includes(s));
    });
  });

  /** Reading time at ~200 words/minute over the visitor-language summary + body, minimum 1. */
  readMins(c: EduItem): number {
    const words = `${this.eduSummary(c)} ${this.eduBody(c)}`.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 200));
  }

  /** Maps the threat severity string onto the shared .pp-sev chip variants. */
  sevClass(severity: string): string {
    return severity === 'Emergency' ? 'sev-emergency' : severity === 'Warning' ? 'sev-warning' : 'sev-watch';
  }

  printPage(): void { window.print(); }

  constructor(route: ActivatedRoute) {
    document.title = 'Education — e-MAAFA';
    inject(PortalDataService).landing$.subscribe((d: { hazardCards?: HazardCard[] }) =>
      this.hazardCards.set(d.hazardCards ?? []));
    this.http.get<{ threats: any[] }>('/api/v1/portal/threats').subscribe(r => this.threats.set(r.threats));
    route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.http.get<EduItem>(`/api/v1/portal/education/${id}`).subscribe({
          next: it => { this.item.set(it); window.scrollTo(0, 0); },
          error: () => this.item.set(null),
        });
      } else {
        this.item.set(null);
        this.http.get<{ contents: EduItem[] }>('/api/v1/portal/education').subscribe(r => this.contents.set(r.contents));
      }
    });
  }
}

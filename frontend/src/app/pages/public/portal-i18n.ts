import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';

/**
 * Bilingual labels for the public portal, mirroring Laravel's DB-driven `label()` helper
 * (translations table, en/sw) and the navbar language toggle. The built-in `LABELS` below are
 * the fallback; on startup the service hydrates the managed translations registry
 * (System Settings → Translations, `GET /v1/portal/i18n`) over them, so an admin edit takes
 * effect on the live site. A missing key falls back to the key itself (visible, not blank).
 */
@Injectable({ providedIn: 'root' })
export class PortalLabels {
  private http = inject(HttpClient);

  /** Current language; persisted like the Laravel session-based switcher. */
  readonly lang = signal<'en' | 'sw'>((localStorage.getItem('dmis-lang') as 'en' | 'sw') || 'en');

  /** Built-in defaults, overlaid by the managed registry once it loads. */
  private labels = signal<Record<string, Entry>>({ ...LABELS });

  constructor() {
    // Hydrate from the translations registry; merge over the defaults. On any failure the
    // built-in labels stand — the public site never renders blank because i18n was unreachable.
    this.http.get<Record<string, Entry>>('/api/v1/portal/i18n').subscribe({
      next: dict => {
        if (dict && Object.keys(dict).length) {
          this.labels.set({ ...LABELS, ...dict });
        }
      },
      error: () => { /* keep the built-in defaults */ },
    });
  }

  toggle(): void {
    this.lang.set(this.lang() === 'en' ? 'sw' : 'en');
    localStorage.setItem('dmis-lang', this.lang());
  }

  /** label('key') — resolves in the current language (registry value if present, else default). */
  t(key: string): string {
    const labels = this.labels();
    return labels[key]?.[this.lang()] ?? labels[key]?.en ?? key;
  }
}

type Entry = { en: string; sw: string };

const LABELS: Record<string, Entry> = {
  // Navbar + topbar
  lbl_home: { en: 'Home', sw: 'Nyumbani' },
  lbl_about: { en: 'About', sw: 'Kuhusu' },
  lbl_portal: { en: 'Portal', sw: 'Tovuti' },
  lbl_publication: { en: 'Publications', sw: 'Machapisho' },
  lbl_education: { en: 'Education', sw: 'Elimu' },
  lbl_login: { en: 'Login', sw: 'Ingia' },
  lbl_emergency_hotlines: { en: 'Emergency Hotlines', sw: 'Simu za Dharura' },
  lbl_disaster: { en: 'Disaster', sw: 'Maafa' },
  lbl_police: { en: 'Police', sw: 'Polisi' },
  lbl_fire: { en: 'Fire', sw: 'Moto' },
  lbl_medical: { en: 'Medical', sw: 'Matibabu' },
  lbl_child_helpline: { en: 'Child Helpline', sw: 'Watoto' },

  // Hero
  lbl_united_republic_of_tanzania: { en: 'The United Republic of Tanzania', sw: 'Jamhuri ya Muungano wa Tanzania' },
  lbl_prime_ministers_office: { en: "Prime Minister's Office", sw: 'Ofisi ya Waziri Mkuu' },
  lbl_disaster_management: { en: 'Disaster Management', sw: 'Usimamizi wa Maafa' },
  lbl_information_system: { en: 'Information System', sw: 'Mfumo wa Taarifa' },
  lbl_about_emaafa: { en: 'About e-MAAFA', sw: 'Kuhusu e-MAAFA' },
  lbl_about_emaafa_title: { en: 'About e-MAAFA Tanzania', sw: 'Kuhusu e-MAAFA Tanzania' },
  lbl_about_emaafa_hero: {
    en: 'The national platform for disaster monitoring, early warning and coordinated response — connecting agencies, responders and communities across Tanzania.',
    sw: 'Jukwaa la kitaifa la ufuatiliaji wa maafa, tahadhari za awali na uratibu wa majibu — likiunganisha taasisi, waokoaji na jamii kote Tanzania.',
  },
  lbl_know_your_hazards: { en: 'Know Your Hazards', sw: 'Fahamu Hatari Zako' },
  lbl_hazards: { en: 'Hazards', sw: 'Hatari' },
  lbl_alerts: { en: 'Alerts', sw: 'Tahadhari' },
  lbl_no_active_alerts: { en: 'No active alerts at this time. Stay prepared.', sw: 'Hakuna tahadhari kwa sasa. Endelea kujiandaa.' },
  lbl_report_hazard: { en: 'Report Hazard', sw: 'Ripoti Hatari' },
  lbl_subscribe_to_alerts: { en: 'Subscribe to Alerts', sw: 'Jiandikishe Tahadhari' },
  lbl_live_monitoring: { en: 'LIVE MONITORING', sw: 'UFUATILIAJI MOJA KWA MOJA' },
  lbl_emergency: { en: 'Emergency', sw: 'Dharura' },
  lbl_warning: { en: 'Warning', sw: 'Tahadhari' },
  lbl_watch: { en: 'Watch', sw: 'Angalizo' },
  lbl_incidents: { en: 'Incidents', sw: 'Matukio' },
  lbl_explore_more: { en: 'Explore more', sw: 'Vinjari zaidi' },
  lbl_active_warnings: { en: 'active warnings', sw: 'tahadhari hai' },
  lbl_people_at_risk: { en: 'people at risk', sw: 'walio hatarini' },
  lbl_show_all: { en: 'Show all', sw: 'Onyesha zote' },
  lbl_stat_agencies: { en: 'EW Agencies', sw: 'Taasisi za Tahadhari' },
  lbl_stat_regions: { en: 'Regions Covered', sw: 'Mikoa Inayohudumiwa' },
  lbl_stat_protected: { en: 'People Protected', sw: 'Watu Wanaolindwa' },
  lbl_stat_response: { en: 'Response Ready', sw: 'Tayari Kujibu' },

  // Sections
  lbl_latest_news: { en: 'News & Events', sw: 'Habari na Matukio' },
  lbl_read_more: { en: 'Read more', sw: 'Soma zaidi' },
  lbl_photo_gallery: { en: 'Photo Gallery', sw: 'Picha za Matukio' },
  lbl_latest_publications: { en: 'Latest Publications', sw: 'Machapisho Mapya' },
  lbl_view_details: { en: 'View Details', sw: 'Angalia Zaidi' },
  lbl_pdf: { en: 'PDF', sw: 'PDF' },
  lbl_view_all_publications: { en: 'View all publications', sw: 'Angalia machapisho yote' },
  lbl_no_publications_yet: { en: 'No publications yet.', sw: 'Hakuna machapisho bado.' },
  lbl_core_features: { en: 'Core System Features', sw: 'Huduma Kuu za Mfumo' },
  lbl_hazards_education_subtitle: {
    en: 'Learn the hazards that can affect your community and how to stay safe.',
    sw: 'Jifunze hatari zinazoweza kuathiri jamii yako na jinsi ya kujikinga.',
  },
  lbl_emergency_hotline: { en: 'Emergency Hotline', sw: 'Simu ya Dharura' },
  lbl_eocc_operations: { en: 'EOCC Operations', sw: 'Operesheni za EOCC' },
  lbl_stakeholders_registered: { en: 'Stakeholders Registered', sw: 'Wadau Waliosajiliwa' },

  // Footer
  lbl_footer_description: {
    en: 'The national Disaster Management Information System of the United Republic of Tanzania — monitoring hazards, issuing early warnings and coordinating response to protect lives and livelihoods.',
    sw: 'Mfumo wa kitaifa wa Taarifa za Usimamizi wa Maafa wa Jamhuri ya Muungano wa Tanzania — kufuatilia hatari, kutoa tahadhari za awali na kuratibu majibu kulinda maisha na riziki.',
  },
  lbl_quick_links: { en: 'Quick Links', sw: 'Viungo vya Haraka' },
  lbl_ql_pmo: { en: "Prime Minister's Office", sw: 'Ofisi ya Waziri Mkuu' },
  lbl_ql_govt_portal: { en: 'Government Portal', sw: 'Tovuti ya Serikali' },
  lbl_ql_undrr: { en: 'UNDRR', sw: 'UNDRR' },
  lbl_ql_tma: { en: 'Meteorological Authority', sw: 'Mamlaka ya Hali ya Hewa' },
  lbl_ql_water: { en: 'Ministry of Water', sw: 'Wizara ya Maji' },
  lbl_ql_nemc: { en: 'NEMC', sw: 'NEMC' },
  lbl_contact_information: { en: 'Contact Information', sw: 'Taarifa za Mawasiliano' },
  lbl_emergency_phone: { en: 'Emergency: 190', sw: 'Dharura: 190' },
  lbl_address: { en: 'Address', sw: 'Anwani' },
  lbl_permanent_secretary: { en: 'Permanent Secretary', sw: 'Katibu Mkuu' },
  lbl_govt_city_mtumba: { en: 'Government City – Mtumba', sw: 'Mji wa Serikali – Mtumba' },
  lbl_po_box_dodoma: { en: 'P.O. Box 980, Dodoma', sw: 'S.L.P 980, Dodoma' },

  // Hazard education descriptions
  lbl_hz_flood: { en: 'Move to higher ground. Never walk or drive through flood water.', sw: 'Hamia sehemu ya juu. Usitembee wala kuendesha kwenye maji ya mafuriko.' },
  lbl_hz_drought: { en: 'Conserve water, plan crops, and follow seasonal forecasts.', sw: 'Tunza maji, panga mazao, fuata utabiri wa msimu.' },
  lbl_hz_earthquake: { en: 'Drop, cover and hold on. Stay away from windows.', sw: 'Inama, jifunike na ng\'ang\'ania. Kaa mbali na madirisha.' },
  lbl_hz_cyclone: { en: 'Secure your home, stock supplies and follow official alerts.', sw: 'Imarisha nyumba, hifadhi mahitaji na fuata tahadhari rasmi.' },
  lbl_hz_epidemic: { en: 'Wash hands, get vaccinated and report unusual illness early.', sw: 'Nawa mikono, pata chanjo na ripoti magonjwa mapema.' },
  lbl_hz_landslide: { en: 'Watch for cracks and tilting trees on slopes after heavy rain.', sw: 'Angalia nyufa na miti inayoinama kwenye miteremko baada ya mvua kubwa.' },
  lbl_hz_fire: { en: 'Install smoke detection, plan escape routes and call 114.', sw: 'Weka king\'ora cha moshi, panga njia za kutoroka na piga 114.' },
  lbl_hz_tsunami: { en: 'If the sea withdraws suddenly, move inland and uphill immediately.', sw: 'Bahari ikirudi ghafla, hamia bara na sehemu za juu mara moja.' },
  lbl_hz_collapse: { en: 'Report cracks in buildings; evacuate structures that shift or lean.', sw: 'Ripoti nyufa kwenye majengo; ondoka kwenye majengo yanayohama.' },
  lbl_hz_heatwave: { en: 'Stay hydrated, avoid midday sun and check on the vulnerable.', sw: 'Kunywa maji, epuka jua la mchana na angalia walio hatarini.' },
  lbl_hz_volcano: { en: 'Know evacuation routes; protect yourself from ash fall.', sw: 'Fahamu njia za kuhama; jikinge na majivu.' },
  lbl_hz_accident: { en: 'Secure the scene, call 112/115 and give first aid if trained.', sw: 'Linda eneo, piga 112/115 na toa huduma ya kwanza ukiwa umefunzwa.' },
};

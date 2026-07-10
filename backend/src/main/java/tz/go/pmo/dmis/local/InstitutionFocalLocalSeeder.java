package tz.go.pmo.dmis.local;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Smart, non-destructive seeder: attaches MDA Focal / Partners demo accounts to real
 * agencies and stakeholders that feed M&amp;E and other modules.
 *
 * <p>Does NOT delete or overwrite existing users. Skips emails already taken and institutions
 * that already have a linked focal. Local-only password: {@code password}.</p>
 *
 * <p>Priority (M&amp;E feeders first): Security/response → Ministries with policy/acronym →
 * key MDAs → academic/research → remaining ministries → UN/dev partners → known NGOs/FBOs/
 * private/media.</p>
 */
@Component
@Profile("local")
@Order(28)
@RequiredArgsConstructor
public class InstitutionFocalLocalSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(InstitutionFocalLocalSeeder.class);
    private static final String MODEL_TYPE = "App\\Models\\User";
    private static final Pattern SAFE = Pattern.compile("[^a-z0-9]+");
    private static final Pattern PAREN_ACRONYM = Pattern.compile("\\(([A-Za-z][A-Za-z0-9\\-]{1,14})\\)\\s*$");
    private static final Pattern JUNK_NAME = Pattern.compile("^[0-9]+$|^[a-z]{1,2}$", Pattern.CASE_INSENSITIVE);

    private final JdbcTemplate jdbc;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    /** Priority MDAs that routinely feed disaster M&amp;E, EW, response or coordination. */
    private static final Set<String> KEY_MDA_ACRONYMS = Set.of(
            "TMA", "TCRA", "TFS", "TPF", "TANESCO", "TANROADS", "TARURA", "RUWASA", "DAWASA",
            "EWURA", "TIRA", "BOT", "TRA", "PPRA", "NEMC", "NBS", "MSD", "TMDA", "NIMR", "GST",
            "TANAPA", "TAWA", "NCAA", "TPA", "TCAA", "TAA", "LATRA", "TASAC", "TRC", "TEMESA",
            "REA", "TPDC", "PURA", "STAMICO", "NFRA", "TARI", "TVLA", "OSHA", "TBS", "BRELA",
            "RITA", "NIDA", "EGA", "GPSA", "NAO", "PCCB", "TAEC", "FRF", "TPDF", "JKT", "TPS",
            "ISD", "NHIF", "NSSF", "PSSSF", "WCF", "TIC", "SIDO", "TANTRADE", "COSTECH", "VETA",
            "NECTA", "TCU", "TEA", "HESLB", "ADEM", "ARU", "UDSM", "UDOM", "SUA", "MUHAS", "OUT",
            "MUST", "IHI", "PMO-DMD", "PO-RALG", "TAMISEMI", "MOH", "MOW", "MOA", "MOF", "MOFP",
            "MOHA", "MOEST", "MNRT", "MICT", "MOE", "MOT", "MLF", "MIIT", "TMAA", "CMSA", "WMA",
            "BWB", "FIRE", "TRCS", "DMD", "DMC", "MOWTC", "MOLHSD", "MOCLA", "MOFA", "MOD",
            "MOCDGWSG", "SUMATRA", "ATCL"
    );

    private static final Set<String> KEY_ACADEMIC = Set.of(
            "ARU", "UDSM", "UDOM", "SUA", "MUHAS", "OUT", "MUST", "NM-AIST", "IHI", "NIMR",
            "NIMRI", "COSTECH", "VETA", "ADEM", "DIT", "IFM", "DMTC", "DMI", "MZU", "MZUMBE"
    );

    private static final List<String> PARTNER_HINTS = List.of(
            "undp", "unicef", "wfp", "who", "fao", "unhcr", "unfpa", "un women", "unwomen", "ilo",
            "iom", "unesco", "unaids", "unep", "habitat", "un-habitat", "unido", "ifad", "unops",
            "undrr", "ocha", "world bank", "worldbank", "imf", "ifc", "global fund", "gavi",
            "amref", "care international", "care tanzania", "world vision", "save the children",
            "plan international", "msf", "médecins", "medecins", "drc", "danish refugee", "nrc",
            "norwegian refugee", "irc", "international rescue", "oxfam", "actionaid", "action aid",
            "crs", "catholic relief", "red cross", "trcs", "caritas", "wwf", "wateraid", "water aid",
            "helpage", "concern worldwide", "concern ", "bakwata", "cct", "tec", "elct", "kkkt",
            "tpsf", "tccia", "cti", "vodacom", "airtel", "tigo", "yas ", "halotel", "crdb", "nmb",
            "jica", "giz", "usaid", "european union", "eu ", "sida", "norad", "danida", "fcdo",
            "koica", "afd", "adrifi", "gfdrr", "african development", "afdb", "irish aid", "swiss",
            "adra", "afrohun", "helvetas", "snv", "vso", "mercy corps", "habitat for humanity",
            "good neighbours", "compassion", "pathfinder", "jhpiego", "fhi 360", "fhi360",
            "intrahealth", "engenderhealth", "psi ", "population services", "brac", "tack",
            "tanzania red", "ifrc", "icrc", "undss", "unhabitat", "wvi", "sc tanzania"
    );

    @Override
    public void run(String... args) {
        try {
            if (!hasColumn("users", "agency_id") || !hasColumn("users", "stakeholder_id")) {
                log.info("institution focal seed skipped: link columns missing");
                return;
            }
            Long mdaRole = roleId("MDA Focal");
            Long partnerRole = roleId("Partners");
            if (mdaRole == null || partnerRole == null) {
                log.warn("institution focal seed skipped: roles missing");
                return;
            }
            String hash = encoder.encode("password");
            int mda = seedMdaFocals(mdaRole, hash);
            int partners = seedPartnerFocals(partnerRole, hash);
            log.info("institution focal seed: {} MDA focals, {} partner focals created (idempotent)",
                    mda, partners);
        } catch (Exception e) {
            log.error("institution focal seed aborted (non-fatal): {}", e.getMessage(), e);
        }
    }

    private int seedMdaFocals(long roleId, String passwordHash) {
        // Priority order: response first, then policy-linked ministries/MDAs, then academics, rest.
        List<Map<String, Object>> agencies = jdbc.queryForList("""
                select a.id, a.name, a.acronym, a.institution_class, a.policy_role_code
                  from public.agencies a
                 where coalesce(a.is_active, true)
                   and not exists (select 1 from public.users u where u.agency_id = a.id)
                   and a.institution_class in (
                        'Ministry', 'Government Institution',
                        'Security and Response Institution', 'Academic and Research Institution',
                        'Government Directorate'
                   )
                   and coalesce(a.name,'') <> ''
                   and a.name !~ '^[0-9]+$'
                   and length(trim(a.name)) > 2
                 order by
                   -- M&E feeders first: response + policy-linked ministries/MDAs + academia,
                   -- then the long tail of inflated ministry/registry rows.
                   case a.institution_class
                     when 'Security and Response Institution' then 1
                     when 'Ministry' then 2
                     when 'Government Institution' then 3
                     when 'Academic and Research Institution' then 4
                     when 'Government Directorate' then 5
                     else 9 end,
                   case when coalesce(a.policy_role_code,'') <> '' then 0 else 1 end,
                   case when coalesce(a.acronym,'') <> '' then 0 else 1 end,
                   a.name
                """);
        int created = 0;
        int limit = 160;
        for (Map<String, Object> a : agencies) {
            if (created >= limit) {
                break;
            }
            if (!shouldSeedMda(a)) {
                continue;
            }
            long agencyId = ((Number) a.get("id")).longValue();
            String name = str(a.get("name"));
            String acr = firstNonBlank(str(a.get("acronym")), extractParenAcronym(name));
            String email = mdaEmail(acr, name, agencyId);
            if (emailTaken(email)) {
                continue;
            }
            String posKey = "mda-focal-" + agencyId;
            if (positionTaken(posKey)) {
                continue;
            }
            String display = (acr != null && !acr.isBlank() ? acr.trim() + " Focal" : "MDA Focal")
                    + " (" + shortName(name) + ")";
            healUsersSeq();
            Long userId = jdbc.queryForObject("""
                    insert into public.users(name, email, password, email_verified_at,
                        agency_id, officer_position, position_key, seeded_officer, created_at, updated_at)
                    values (?,?,?, now(), ?, ?, ?, true, now(), now())
                    returning id
                    """, Long.class, display, email, passwordHash, agencyId,
                    "MDA Focal — " + shortName(name), posKey);
            jdbc.update("""
                    insert into public.model_has_roles(role_id, model_type, model_id)
                    values (?,?,?) on conflict do nothing
                    """, roleId, MODEL_TYPE, userId);
            created++;
        }
        return created;
    }

    private boolean shouldSeedMda(Map<String, Object> a) {
        String iclass = str(a.get("institution_class"));
        String acr = upper(firstNonBlank(str(a.get("acronym")), extractParenAcronym(str(a.get("name")))));
        String role = str(a.get("policy_role_code"));
        String name = str(a.get("name"));
        if (name == null || JUNK_NAME.matcher(name.trim()).matches()) {
            return false;
        }
        // Skip obvious judicial/legislative shells that don't feed sector M&E
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.contains("mahakama") || lower.startsWith("bunge ")) {
            return false;
        }
        if ("Ministry".equals(iclass)) {
            return true;
        }
        if ("Security and Response Institution".equals(iclass)) {
            return true;
        }
        if ("Government Directorate".equals(iclass)) {
            return role != null && !role.isBlank();
        }
        if ("Government Institution".equals(iclass)) {
            if (role != null && !role.isBlank()) {
                return true;
            }
            return acr != null && KEY_MDA_ACRONYMS.contains(acr);
        }
        if ("Academic and Research Institution".equals(iclass)) {
            if (acr != null && KEY_ACADEMIC.contains(acr)) {
                return true;
            }
            return role != null && (role.contains("ACADEMIC") || role.contains("EDUCATION")
                    || role.contains("HEALTH") || role.contains("TMA") || role.contains("LANDS")
                    || role.contains("FINANCE"));
        }
        return false;
    }

    private int seedPartnerFocals(long roleId, String passwordHash) {
        List<Map<String, Object>> partners = jdbc.queryForList("""
                select s.id, s.name, s.organization, s.institution_class, s.type
                  from public.stakeholders s
                 where coalesce(s.is_active, true)
                   and not exists (select 1 from public.users u where u.stakeholder_id = s.id)
                   and s.institution_class in (
                        'UN Agency','NGO','Faith-Based Organization','Private Sector',
                        'Media','Development Partner'
                   )
                   and coalesce(s.organization, s.name, '') <> ''
                   and coalesce(s.organization, s.name, '') !~ '^[0-9]+$'
                   and length(trim(coalesce(s.organization, s.name, ''))) > 2
                 order by
                   case s.institution_class
                     when 'UN Agency' then 1
                     when 'Development Partner' then 2
                     when 'Faith-Based Organization' then 3
                     when 'NGO' then 4
                     when 'Media' then 5
                     when 'Private Sector' then 6
                     else 9 end,
                   coalesce(s.organization, s.name)
                """);
        int created = 0;
        int limit = 120;
        for (Map<String, Object> s : partners) {
            if (created >= limit) {
                break;
            }
            if (!shouldSeedPartner(s)) {
                continue;
            }
            long sid = ((Number) s.get("id")).longValue();
            String org = firstNonBlank(str(s.get("organization")), str(s.get("name")));
            String email = partnerEmail(org, sid);
            if (emailTaken(email)) {
                continue;
            }
            String posKey = "partner-focal-" + sid;
            if (positionTaken(posKey)) {
                continue;
            }
            String iclass = str(s.get("institution_class"));
            healUsersSeq();
            Long userId = jdbc.queryForObject("""
                    insert into public.users(name, email, password, email_verified_at,
                        stakeholder_id, officer_position, position_key, seeded_officer, created_at, updated_at)
                    values (?,?,?, now(), ?, ?, ?, true, now(), now())
                    returning id
                    """, Long.class, shortName(org), email, passwordHash, sid,
                    "Partner focal — " + (iclass != null ? iclass : "Organisation"), posKey);
            jdbc.update("""
                    insert into public.model_has_roles(role_id, model_type, model_id)
                    values (?,?,?) on conflict do nothing
                    """, roleId, MODEL_TYPE, userId);
            jdbc.update("""
                    update public.stakeholders
                       set user_id = coalesce(user_id, ?), updated_at = now()
                     where id = ? and user_id is null
                    """, userId, sid);
            created++;
        }
        return created;
    }

    private boolean shouldSeedPartner(Map<String, Object> s) {
        String iclass = str(s.get("institution_class"));
        String org = firstNonBlank(str(s.get("organization")), str(s.get("name")));
        if (org == null || JUNK_NAME.matcher(org.trim()).matches()) {
            return false;
        }
        if ("UN Agency".equals(iclass) || "Development Partner".equals(iclass)) {
            return true;
        }
        String lower = org.toLowerCase(Locale.ROOT);
        for (String h : PARTNER_HINTS) {
            if (lower.contains(h.trim())) {
                return true;
            }
        }
        // Media with known broadcasters / council
        if ("Media".equals(iclass) && (lower.contains("tbc") || lower.contains("broadcast")
                || lower.contains("mct") || lower.contains("itv") || lower.contains("tsn"))) {
            return true;
        }
        // Substantial named FBOs (not single-letter shells)
        if ("Faith-Based Organization".equals(iclass) && org.length() >= 4) {
            return true;
        }
        // Named private operators commonly used for DM comms / logistics
        if ("Private Sector".equals(iclass) && (lower.contains("bank") || lower.contains("telecom")
                || lower.contains("insurance") || lower.contains("transport") || lower.contains("logistics")
                || lower.contains("port") || lower.contains("airline") || lower.contains("rail"))) {
            return true;
        }
        return false;
    }

    private String mdaEmail(String acronym, String name, long agencyId) {
        if (acronym != null && !acronym.isBlank()) {
            String base = slug(acronym);
            if (!base.isBlank()) {
                String email = base + "@pmo.go.tz";
                if (!emailTaken(email)) {
                    return email;
                }
                email = base + ".focal@pmo.go.tz";
                if (!emailTaken(email)) {
                    return email;
                }
            }
        }
        String base = slug(name);
        if (base.length() > 24) {
            base = base.substring(0, 24);
        }
        if (base.isBlank()) {
            base = "mda" + agencyId;
        }
        String email = base + "@pmo.go.tz";
        if (!emailTaken(email)) {
            return email;
        }
        return base + agencyId + "@pmo.go.tz";
    }

    private String partnerEmail(String org, long sid) {
        String base = slug(org);
        if (base.length() > 28) {
            base = base.substring(0, 28);
        }
        if (base.isBlank()) {
            base = "partner" + sid;
        }
        String email = base + "@partner.tz";
        if (!emailTaken(email)) {
            return email;
        }
        return base + sid + "@partner.tz";
    }

    private static String extractParenAcronym(String name) {
        if (name == null) {
            return null;
        }
        Matcher m = PAREN_ACRONYM.matcher(name.trim());
        if (m.find()) {
            return m.group(1);
        }
        return null;
    }

    private static String slug(String raw) {
        if (raw == null) {
            return "";
        }
        return SAFE.matcher(raw.toLowerCase(Locale.ROOT).trim()).replaceAll("");
    }

    private static String shortName(String name) {
        if (name == null) {
            return "Institution";
        }
        String n = name.trim();
        return n.length() > 80 ? n.substring(0, 77) + "…" : n;
    }

    private static String firstNonBlank(String a, String b) {
        if (a != null && !a.isBlank()) {
            return a;
        }
        return b;
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static String upper(String s) {
        return s == null ? null : s.trim().toUpperCase(Locale.ROOT);
    }

    private boolean emailTaken(String email) {
        Long n = jdbc.queryForObject(
                "select count(*) from public.users where lower(email) = lower(?)", Long.class, email);
        return n != null && n > 0;
    }

    private boolean positionTaken(String key) {
        Long n = jdbc.queryForObject(
                "select count(*) from public.users where position_key = ?", Long.class, key);
        return n != null && n > 0;
    }

    private Long roleId(String name) {
        List<Long> ids = jdbc.queryForList("select id from public.roles where name = ?", Long.class, name);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private boolean hasColumn(String table, String column) {
        Long n = jdbc.queryForObject("""
                select count(*) from information_schema.columns
                 where table_schema = 'public' and table_name = ? and column_name = ?
                """, Long.class, table, column);
        return n != null && n > 0;
    }

    private void healUsersSeq() {
        jdbc.queryForList("""
                select setval(pg_get_serial_sequence('public.users','id'), m)
                  from (select max(id) m from public.users) s where m is not null
                """);
    }
}

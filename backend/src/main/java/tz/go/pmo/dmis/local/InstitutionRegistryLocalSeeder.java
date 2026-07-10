package tz.go.pmo.dmis.local;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Imports the provided DMD stakeholder workbooks after they have been normalized into a classpath CSV.
 * The source spreadsheets stay external; this seed gives the local system a governed, deduplicated registry
 * that super admins can refine through System Settings.
 */
@Component
@Profile("local")
@Order(22)
@RequiredArgsConstructor
public class InstitutionRegistryLocalSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(InstitutionRegistryLocalSeeder.class);
    private static final String RESOURCE = "reference/institutions/dmis_institution_registry.csv";
    private static final String RESOURCE_EXPANSION =
            "reference/institutions/dmis_institution_registry_expansion_v175.csv";

    private final JdbcTemplate jdbc;

    @Override
    public void run(String... args) {
        // Local seed must never take the platform down. Registry CSV is external reference data;
        // a single oversize/invalid row is an import defect, not a reason to abort boot.
        try {
            seedRegistry();
        } catch (Exception e) {
            log.error("institution registry seed aborted (non-fatal for local boot): {}", e.getMessage(), e);
        }
    }

    private void seedRegistry() {
        if (!hasColumn("agencies", "institution_class") || !hasColumn("stakeholders", "institution_class")) {
            log.info("institution registry seed skipped: V170 metadata columns are not available yet");
            return;
        }
        int agencies = 0;
        int stakeholders = 0;
        int skipped = 0;
        for (String resourcePath : List.of(RESOURCE, RESOURCE_EXPANSION)) {
            List<Row> rows = loadRows(resourcePath);
            for (Row row : rows) {
                try {
                    if ("agency".equals(row.registryKind())) {
                        upsertAgency(row);
                        agencies++;
                    } else if ("stakeholder".equals(row.registryKind())) {
                        upsertStakeholder(row);
                        stakeholders++;
                    }
                } catch (Exception e) {
                    skipped++;
                    log.warn("institution registry seed skip {} '{}': {}", row.registryKind(), safeName(row),
                            e.getMessage());
                }
            }
            log.info("institution registry seed file {}: processed from {}", rows.size(), resourcePath);
        }
        log.info("institution registry seed total: {} agencies, {} stakeholders processed ({} skipped)",
                agencies, stakeholders, skipped);
    }

    private List<Row> loadRows() {
        return loadRows(RESOURCE);
    }

    private List<Row> loadRows(String resourcePath) {
        try {
            ClassPathResource resource = new ClassPathResource(resourcePath);
            if (!resource.exists()) {
                log.warn("institution registry seed skipped: {} not found", resourcePath);
                return List.of();
            }
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(resource.getInputStream(),
                    StandardCharsets.UTF_8))) {
                List<String> header = null;
                List<Row> rows = new ArrayList<>();
                String line;
                while ((line = reader.readLine()) != null) {
                    List<String> cells = parseCsvLine(line);
                    if (header == null) {
                        header = cells;
                        continue;
                    }
                    rows.add(Row.from(header, cells));
                }
                return rows;
            }
        } catch (Exception e) {
            log.warn("institution registry seed failed to load {}: {}", resourcePath, e.getMessage());
            return List.of();
        }
    }

    private void upsertAgency(Row row) {
        // Column widths mirror V31 + V170/V171. Clip so future CSV rows cannot crash boot.
        String name = clip(row.name(), 255);
        String acronym = clip(row.acronym(), 50);
        String agencyType = clip(defaultText(row.recordType(), "Government"), 100);
        String contactName = clip(row.contactPersonName(), 255);
        String email = clip(row.email(), 255);
        String phone = clip(row.phone(), 255);
        String website = clip(row.website(), 255);
        String institutionClass = clip(row.institutionClass(), 120);
        String institutionSubclass = clip(row.institutionSubclass(), 160);
        String sourceReg = clip(sourceRegister(row), 160);
        String sourceFile = clip(row.sourceFile(), 255);
        String sourceSheet = clip(row.sourceSheet(), 160);
        String policyRole = clip(row.policyRoleCode(), 90);
        Long id = findAgency(name, acronym);
        if (id == null) {
            jdbc.update("""
                    insert into public.agencies(name, acronym, agency_type, mandate_description, contact_person_name,
                        contact_person_email, contact_person_phone, office_address, website, is_active,
                        institution_class, institution_subclass, sector_tags, me_required, source_register,
                        source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
                        created_at, updated_at)
                    values (?,?,?,?,?,?,?,?,?,true,?,?,?,?,?,?,?,?,?,?,?,now(),now())
                    """, name, acronym, agencyType, blankToNull(row.roleSummary()), contactName, email, phone,
                    blankToNull(row.address()), website, institutionClass, institutionSubclass,
                    blankToNull(row.sectorTags()), true, sourceReg, sourceFile, sourceSheet, row.sourceRowInt(),
                    blankToNull(row.sourceReference()), policyRole, blankToNull(row.roleSummary()));
            return;
        }
        jdbc.update("""
                update public.agencies
                   set acronym = coalesce(nullif(acronym,''), ?),
                       agency_type = coalesce(agency_type, ?),
                       mandate_description = coalesce(mandate_description, ?),
                       contact_person_name = coalesce(contact_person_name, ?),
                       contact_person_email = coalesce(contact_person_email, ?),
                       contact_person_phone = coalesce(contact_person_phone, ?),
                       office_address = coalesce(office_address, ?),
                       website = coalesce(website, ?),
                       institution_class = coalesce(institution_class, ?),
                       institution_subclass = coalesce(institution_subclass, ?),
                       sector_tags = coalesce(nullif(sector_tags,''), ?),
                       me_required = true,
                       source_register = coalesce(source_register, ?),
                       source_file = coalesce(source_file, ?),
                       source_sheet = coalesce(source_sheet, ?),
                       source_row = coalesce(source_row, ?),
                       source_reference = coalesce(source_reference, ?),
                       policy_role_code = coalesce(policy_role_code, ?),
                       role_summary = coalesce(role_summary, ?),
                       updated_at = now()
                 where id = ?
                """, acronym, agencyType, blankToNull(row.roleSummary()), contactName, email, phone,
                blankToNull(row.address()), website, institutionClass, institutionSubclass,
                blankToNull(row.sectorTags()), sourceReg, sourceFile, sourceSheet, row.sourceRowInt(),
                blankToNull(row.sourceReference()), policyRole, blankToNull(row.roleSummary()), id);
    }

    private void upsertStakeholder(Row row) {
        Long id = findStakeholder(row.name());
        String stakeholderType = stakeholderType(row.recordType());
        String orgName = clip(row.name(), 255);
        String contactName = clip(defaultText(row.contactPersonName(), row.name()), 255);
        String sector = clip(row.sectorTags(), 255);
        String email = clip(row.email(), 255);
        String phone = clip(row.phone(), 255);
        String region = clip(row.region(), 255);
        String district = clip(row.district(), 255);
        String personName = clip(row.contactPersonName(), 255);
        String personTitle = clip(row.contactPersonTitle(), 255);
        String institutionClass = clip(row.institutionClass(), 120);
        String institutionSubclass = clip(row.institutionSubclass(), 160);
        String sourceReg = clip(sourceRegister(row), 160);
        String sourceFile = clip(row.sourceFile(), 255);
        String sourceSheet = clip(row.sourceSheet(), 160);
        String policyRole = clip(row.policyRoleCode(), 90);
        if (id == null) {
            jdbc.update("""
                    insert into public.stakeholders(name, organization, type, sector, email, phone, address, region,
                        district, contact_person_name, contact_person_title, contact_person_phone, is_active,
                        is_verified, institution_class, institution_subclass, sector_tags, me_required,
                        source_register, source_file, source_sheet, source_row, source_reference,
                        policy_role_code, role_summary, created_at, updated_at)
                    values (?,?,?,?,?,?,?,?,?,?,?,?,true,false,?,?,?,?,?,?,?,?,?,?,?,now(),now())
                    """, contactName, orgName, stakeholderType, sector, email, phone, blankToNull(row.address()),
                    region, district, personName, personTitle, phone, institutionClass, institutionSubclass,
                    blankToNull(row.sectorTags()), true, sourceReg, sourceFile, sourceSheet, row.sourceRowInt(),
                    blankToNull(row.sourceReference()), policyRole, blankToNull(row.roleSummary()));
            return;
        }
        jdbc.update("""
                update public.stakeholders
                   set type = coalesce(type, ?),
                       sector = coalesce(sector, ?),
                       email = coalesce(email, ?),
                       phone = coalesce(phone, ?),
                       address = coalesce(address, ?),
                       region = coalesce(region, ?),
                       district = coalesce(district, ?),
                       contact_person_name = coalesce(contact_person_name, ?),
                       contact_person_title = coalesce(contact_person_title, ?),
                       contact_person_phone = coalesce(contact_person_phone, ?),
                       institution_class = coalesce(institution_class, ?),
                       institution_subclass = coalesce(institution_subclass, ?),
                       sector_tags = coalesce(nullif(sector_tags,''), ?),
                       me_required = true,
                       source_register = coalesce(source_register, ?),
                       source_file = coalesce(source_file, ?),
                       source_sheet = coalesce(source_sheet, ?),
                       source_row = coalesce(source_row, ?),
                       source_reference = coalesce(source_reference, ?),
                       policy_role_code = coalesce(policy_role_code, ?),
                       role_summary = coalesce(role_summary, ?),
                       updated_at = now()
                 where id = ?
                """, stakeholderType, sector, email, phone, blankToNull(row.address()), region, district,
                personName, personTitle, phone, institutionClass, institutionSubclass,
                blankToNull(row.sectorTags()), sourceReg, sourceFile, sourceSheet, row.sourceRowInt(),
                blankToNull(row.sourceReference()), policyRole, blankToNull(row.roleSummary()), id);
    }

    private Long findAgency(String name, String acronym) {
        List<Long> ids = acronym == null || acronym.isBlank()
                ? jdbc.queryForList("select id from public.agencies where lower(name) = lower(?) order by id limit 1",
                        Long.class, name)
                : jdbc.queryForList("""
                        select id from public.agencies
                         where lower(name) = lower(?) or lower(coalesce(acronym,'')) = lower(?)
                         order by case when lower(name) = lower(?) then 0 else 1 end, id
                         limit 1
                        """, Long.class, name, acronym, name);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private Long findStakeholder(String organization) {
        List<Long> ids = jdbc.queryForList("""
                select id from public.stakeholders
                 where lower(coalesce(organization, name)) = lower(?)
                    or lower(name) = lower(?)
                 order by id
                 limit 1
                """, Long.class, organization, organization);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private boolean hasColumn(String table, String column) {
        Long n = jdbc.queryForObject("""
                select count(*) from information_schema.columns
                 where table_schema = 'public' and table_name = ? and column_name = ?
                """, Long.class, table, column);
        return n != null && n > 0;
    }

    private static String stakeholderType(String value) {
        String v = defaultText(value, "NGO").toLowerCase(Locale.ROOT);
        if (v.contains("government")) {
            return "Government";
        }
        if (v.contains("private")) {
            return "Private";
        }
        if (v.contains("international") || v.contains("un") || v.contains("development")) {
            return "International";
        }
        if (v.contains("community")) {
            return "Community";
        }
        if (v.contains("individual")) {
            return "Individual";
        }
        return "NGO";
    }

    private static String sourceRegister(Row row) {
        if (row.sourceFile().contains("FINAL_DRR")) {
            return "Provided DRR Stakeholder Database";
        }
        if (row.sourceFile().contains("ORODHA")) {
            return "Provided Invitation / Stakeholder Workbook";
        }
        return "Provided reference data";
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static String defaultText(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    /** Null/blank → null; otherwise trim and cap to column width (no silent pad). */
    private static String clip(String value, int maxLen) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.length() <= maxLen) {
            return trimmed;
        }
        return trimmed.substring(0, maxLen);
    }

    private static String safeName(Row row) {
        if (row == null || row.name() == null || row.name().isBlank()) {
            return "(unnamed)";
        }
        String n = row.name().trim();
        return n.length() <= 80 ? n : n.substring(0, 80) + "…";
    }

    private static List<String> parseCsvLine(String line) {
        List<String> cells = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') {
                if (quoted && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    cell.append('"');
                    i++;
                } else {
                    quoted = !quoted;
                }
            } else if (c == ',' && !quoted) {
                cells.add(cell.toString());
                cell.setLength(0);
            } else {
                cell.append(c);
            }
        }
        cells.add(cell.toString());
        return cells;
    }

    private record Row(String registryKind, String name, String acronym, String recordType,
                       String institutionClass, String institutionSubclass, String sectorTags,
                       String contactPersonName, String contactPersonTitle, String email, String phone,
                       String region, String district, String address, String website, String sourceFile,
                       String sourceSheet, String sourceRow, String sourceReference, String policyRoleCode,
                       String roleSummary) {
        static Row from(List<String> header, List<String> cells) {
            return new Row(v(header, cells, "registry_kind"), v(header, cells, "name"),
                    v(header, cells, "acronym"), v(header, cells, "record_type"),
                    v(header, cells, "institution_class"), v(header, cells, "institution_subclass"),
                    v(header, cells, "sector_tags"), v(header, cells, "contact_person_name"),
                    v(header, cells, "contact_person_title"), v(header, cells, "email"),
                    v(header, cells, "phone"), v(header, cells, "region"), v(header, cells, "district"),
                    combinedAddress(header, cells), v(header, cells, "website"), v(header, cells, "source_file"),
                    v(header, cells, "source_sheet"), v(header, cells, "source_row"),
                    v(header, cells, "source_reference"), v(header, cells, "policy_role_code"),
                    v(header, cells, "role_summary"));
        }

        Integer sourceRowInt() {
            if (sourceRow == null || sourceRow.isBlank()) {
                return null;
            }
            try {
                return Integer.parseInt(sourceRow);
            } catch (NumberFormatException e) {
                return null;
            }
        }

        private static String combinedAddress(List<String> header, List<String> cells) {
            String address = v(header, cells, "address");
            String city = v(header, cells, "city");
            if (city.isBlank()) {
                return address;
            }
            return address.isBlank() ? city : address + ", " + city;
        }

        private static String v(List<String> header, List<String> cells, String key) {
            int index = header.indexOf(key);
            if (index < 0 || index >= cells.size()) {
                return "";
            }
            return cells.get(index) == null ? "" : cells.get(index).trim();
        }
    }
}

package tz.go.pmo.dmis.service.impl;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.service.KnowledgeRepositoryService;

/**
 * Lessons Learned / Knowledge Repository (Recovery) — port of the Laravel
 * disaster_knowledge_repositories module: the searchable library of case studies, best practices,
 * lessons learned and technical guides captured after disasters, with a Pending → Approved review.
 * Closes the recovery loop: what we learned feeds the next mitigation/preparedness cycle.
 */
@Service
public class KnowledgeRepositoryServiceImpl implements KnowledgeRepositoryService {

    private static final List<String> TYPES = List.of("Case Study", "Best Practice", "Lesson Learned",
            "Research Report", "Technical Guide", "Guideline", "Bulletin");

    private final JdbcTemplate jdbc;
    private final Path storageRoot;

    public KnowledgeRepositoryServiceImpl(JdbcTemplate jdbc,
                                         @Value("${dmis.storage.public-root:${user.dir}/storage/public}") String publicRoot) {
        this.jdbc = jdbc;
        this.storageRoot = Path.of(publicRoot).toAbsolutePath().normalize();
    }

    @Override
    public Map<String, Object> index(String type,
                                     String approval,
                                     String search) {
        StringBuilder where = new StringBuilder("1=1");
        List<Object> p = new ArrayList<>();
        if (type != null && !type.isBlank()) { where.append(" and coalesce(k.content_type, k.document_type) = ?"); p.add(type); }
        if (approval != null && !approval.isBlank()) { where.append(" and coalesce(k.approval_status,'Pending') = ?"); p.add(approval); }
        if (search != null && !search.isBlank()) {
            where.append(" and (coalesce(k.content_title, k.title) ilike ? or k.description ilike ? or k.hazard_type ilike ?)");
            p.add("%" + search + "%"); p.add("%" + search + "%"); p.add("%" + search + "%");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("entries", jdbc.queryForList("""
                select k.id, coalesce(k.content_title, k.title) as title, k.description,
                       coalesce(k.content_type, k.document_type) as content_type, k.hazard_type,
                       coalesce(k.date_of_publication, k.disaster_date) as published_on, k.location, k.region,
                       coalesce(k.uploader_name, k.contributor) as contributor,
                       coalesce(k.uploader_institution, k.contributor_organization) as organization,
                       coalesce(k.approval_status,'Pending') as approval_status, coalesce(k.downloads_count, 0) as downloads_count,
                       k.incident_id, i.title as incident_title, k.file_path, k.file_name,
                       k.file_content_type, k.file_size_bytes
                from public.disaster_knowledge_repositories k
                left join public.incidents i on i.id = k.incident_id
                where %s order by coalesce(k.date_of_publication, k.disaster_date) desc nulls last, k.id desc limit 200
                """.formatted(where), p.toArray()));
        out.put("stats", jdbc.queryForMap("""
                select count(*) as total,
                       count(*) filter (where coalesce(approval_status,'Pending')='Approved') as approved,
                       count(*) filter (where coalesce(approval_status,'Pending')='Pending') as pending,
                       count(*) filter (where coalesce(content_type,document_type)='Lesson Learned') as lessons,
                       count(*) filter (where file_path is not null and btrim(file_path) <> '') as documents
                from public.disaster_knowledge_repositories
                """));
        out.put("by_type", jdbc.queryForList("""
                select coalesce(content_type, document_type, 'Other') as content_type, count(*) as count
                from public.disaster_knowledge_repositories
                group by coalesce(content_type, document_type, 'Other') order by count desc
                """));
        out.put("incidents", jdbc.queryForList("""
                select id, title, severity_level, status
                from public.incidents
                where coalesce(is_simulation, false) = false
                order by reported_at desc nulls last, id desc
                limit 200
                """));
        out.put("types", TYPES);
        return out;
    }

    @Transactional
    @Override
    public Map<String, Object> store(Map<String, Object> b) {
        return createEntry(b, null);
    }

    @Transactional
    @Override
    public Map<String, Object> storeMultipart(Map<String, String> b,
                                              MultipartFile document,
                                              MultipartFile attachment) {
        return createEntry(b, hasFile(document) ? document : attachment);
    }

    private Map<String, Object> createEntry(Map<String, ?> b, MultipartFile document) {
        String title = require(b.get("title"), "title");
        String type = TYPES.contains(str(b.get("content_type"))) ? str(b.get("content_type")) : "Lesson Learned";
        Long incidentId = parseLong(b.get("incident_id"));
        assertIncidentExists(incidentId);
        StoredFile stored = storeDocument(document);
        Long id = jdbc.queryForObject("""
                insert into public.disaster_knowledge_repositories(title, content_title, description,
                    content_type, document_type, hazard_type, disaster_date, date_of_publication, location,
                    region, contributor, uploader_name, contributor_organization, uploader_institution,
                    visibility_level, status, approval_status, downloads_count, version, incident_id,
                    file_path, file_name, file_content_type, file_size_bytes, created_at, updated_at)
                values (?,?,?,?,?,?, coalesce(?::date, current_date), coalesce(?::date, current_date), ?, ?, ?, ?, ?, ?,
                        'public', 'pending', 'Pending', 0, 1, ?, ?, ?, ?, ?, now(), now()) returning id
                """, Long.class, title, title, str(b.get("description")), type, type,
                strOr(b.get("hazard_type"), "General"), str(b.get("published_on")), str(b.get("published_on")),
                strOr(b.get("location"), "National"), strOr(b.get("region"), "National"),
                strOr(b.get("contributor"), "PMO-DMD"), strOr(b.get("contributor"), "PMO-DMD"),
                str(b.get("organization")), str(b.get("organization")), incidentId, stored.path(), stored.name(),
                stored.contentType(), stored.sizeBytes());
        return Map.of("success", true, "id", id, "message", "Knowledge entry submitted for review.");
    }

    @Transactional
    @Override
    public ResponseEntity<ByteArrayResource> download(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select file_path, file_name, file_content_type
                from public.disaster_knowledge_repositories where id = ?
                """, id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Entry not found.");
        }
        Map<String, Object> row = rows.get(0);
        String relative = str(row.get("file_path"));
        if (relative == null) {
            throw new ResourceNotFoundException("This knowledge entry has no downloadable document.");
        }
        Path file = storageRoot.resolve(relative).normalize();
        if (!file.startsWith(storageRoot)) {
            throw new BusinessRuleException("Invalid document path.");
        }
        if (!Files.isRegularFile(file)) {
            throw new ResourceNotFoundException("The document file is missing from storage.");
        }
        try {
            byte[] body = Files.readAllBytes(file);
            jdbc.update("update public.disaster_knowledge_repositories set downloads_count = coalesce(downloads_count, 0) + 1, updated_at = now() where id = ?", id);
            String filename = strOr(row.get("file_name"), file.getFileName().toString());
            MediaType mediaType = parseMediaType(str(row.get("file_content_type")));
            return ResponseEntity.ok()
                    .contentType(mediaType)
                    .contentLength(body.length)
                    .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(filename).build().toString())
                    .body(new ByteArrayResource(body));
        } catch (IOException e) {
            throw new BusinessRuleException("Could not read the document file.");
        }
    }

    @Transactional
    @Override
    public Map<String, Object> approve(long id) {
        if (jdbc.update("update public.disaster_knowledge_repositories set approval_status='Approved', status='approved', approval_date=now(), updated_at=now() where id=?", id) == 0) {
            throw new ResourceNotFoundException("Entry not found.");
        }
        return Map.of("success", true, "message", "Entry approved and published.");
    }

    private static String str(Object v) {
        if (v == null) { return null; }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
    private static String strOr(Object v, String d) { String s = str(v); return s == null ? d : s; }
    private static Long parseLong(Object v) {
        String s = str(v);
        if (s == null) { return null; }
        try {
            return Long.parseLong(s);
        } catch (NumberFormatException e) {
            throw new BusinessRuleException("The incident_id field must be numeric.");
        }
    }
    private static String require(Object v, String f) {
        String s = str(v);
        if (s == null) { throw new BusinessRuleException("The " + f + " field is required."); }
        return s;
    }
    private void assertIncidentExists(Long incidentId) {
        if (incidentId == null) {
            return;
        }
        Long n = jdbc.queryForObject("select count(*) from public.incidents where id = ?", Long.class, incidentId);
        if (n == null || n == 0) {
            throw new ResourceNotFoundException("Incident " + incidentId + " not found.");
        }
    }
    private StoredFile storeDocument(MultipartFile file) {
        if (!hasFile(file)) {
            return new StoredFile(null, null, null, null);
        }
        String original = StringUtils.cleanPath(file.getOriginalFilename() == null ? "document" : file.getOriginalFilename());
        String ext = original.contains(".")
                ? original.substring(original.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
        if (!List.of("pdf", "doc", "docx").contains(ext)) {
            throw new BusinessRuleException("The document must be a file of type: pdf, doc, docx.");
        }
        if (file.getSize() > 10240L * 1024) {
            throw new BusinessRuleException("The document must not be greater than 10240 kilobytes.");
        }
        try {
            Path dir = storageRoot.resolve("knowledge");
            Files.createDirectories(dir);
            String storedName = UUID.randomUUID() + "." + ext;
            try (var in = file.getInputStream()) {
                Files.copy(in, dir.resolve(storedName), StandardCopyOption.REPLACE_EXISTING);
            }
            return new StoredFile("knowledge/" + storedName, original, strOr(file.getContentType(), MediaType.APPLICATION_OCTET_STREAM_VALUE), file.getSize());
        } catch (IOException e) {
            throw new BusinessRuleException("Failed to store the document.");
        }
    }
    private static boolean hasFile(MultipartFile file) {
        return file != null && !file.isEmpty();
    }
    private static MediaType parseMediaType(String value) {
        if (value == null) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
        try {
            return MediaType.parseMediaType(value);
        } catch (Exception e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }
    private record StoredFile(String path, String name, String contentType, Long sizeBytes) {
    }
}

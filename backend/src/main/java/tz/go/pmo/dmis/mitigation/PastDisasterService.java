package tz.go.pmo.dmis.mitigation;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;

/**
 * Reproduces Admin/PastDisasterController over the existing {@code past_disasters} table: index
 * payload (paginate 15 latest by event_date + 4 stats + 2 chart datasets + hazard options), show,
 * store/update with the report-document upload semantics (replace deletes old; remove flag nulls),
 * and destroy (deletes the stored file).
 */
@Service
@RequiredArgsConstructor
public class PastDisasterService {

    private static final int PER_PAGE = 15;
    private static final ZoneId ZONE = ZoneId.of("Africa/Dar_es_Salaam");
    private static final DateTimeFormatter D_MON_Y = DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH);
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("pdf", "doc", "docx", "txt", "jpg", "png");
    private static final long MAX_FILE_BYTES = 5120L * 1024; // Laravel max:5120 (KB)
    private static final String REPORTS_DIR = "past_disaster_reports";

    private final PastDisasterRepository disasters;
    private final MitHazardRepository hazards;

    @Value("${dmis.storage.public-root:${user.dir}/storage/public}")
    private String publicRoot;

    @Transactional(readOnly = true)
    public PastDisasterResponses.Index index(int page) {
        Page<PastDisaster> result = disasters.findAllByOrderByEventDateDesc(PageRequest.of(Math.max(page, 1) - 1, PER_PAGE));
        List<PastDisasterResponses.Row> rows = result.getContent().stream()
                .map(d -> new PastDisasterResponses.Row(d.getId(), d.getEventName(), fmt(d.getEventDate()),
                        d.getLocationDescription(), d.getHazard() != null ? d.getHazard().getName() : null,
                        d.getReportDocumentPath()))
                .toList();
        PastDisasterResponses.Stats stats = new PastDisasterResponses.Stats(
                disasters.count(),
                disasters.countByEventDateGreaterThanEqual(LocalDate.now(ZONE).minusYears(1)),
                disasters.countByReportDocumentPathNotNull(),
                disasters.countByLatitudeNotNullAndLongitudeNotNull());
        List<PastDisasterResponses.HazardOption> hazardOptions = hazards
                .findAll(org.springframework.data.domain.Sort.by("name")).stream()
                .map(h -> new PastDisasterResponses.HazardOption(h.getId(), h.getName()))
                .toList();
        List<PastDisasterResponses.HazardTypeDatum> byHazardType = disasters.countByHazardName().stream()
                .map(c -> new PastDisasterResponses.HazardTypeDatum(c.getHazardName(), c.getTotal()))
                .toList();
        List<PastDisasterResponses.YearDatum> byYear = disasters.countByYear().stream()
                .map(c -> new PastDisasterResponses.YearDatum(c.getYear(), c.getTotal()))
                .toList();
        int first = result.getTotalElements() == 0 ? 0 : result.getNumber() * PER_PAGE + 1;
        int last = result.getTotalElements() == 0 ? 0 : result.getNumber() * PER_PAGE + result.getNumberOfElements();
        PastDisasterResponses.Pagination pagination = new PastDisasterResponses.Pagination(
                result.getNumber() + 1, Math.max(result.getTotalPages(), 1), result.getTotalElements(), first, last);
        return new PastDisasterResponses.Index(rows, pagination, stats, hazardOptions, byHazardType, byYear);
    }

    @Transactional(readOnly = true)
    public PastDisasterResponses.Detail show(Long id) {
        return toDetail(find(id));
    }

    @Transactional
    public PastDisasterResponses.Detail store(PastDisasterWriteRequest request) {
        if (disasters.existsByEventName(request.getEventName())) {
            throw new BusinessRuleException("The event name has already been taken.");
        }
        PastDisaster disaster = new PastDisaster();
        apply(disaster, request);
        if (hasFile(request.getReportDocument())) {
            disaster.setReportDocumentPath(storeFile(request.getReportDocument()));
        }
        disaster.setCreatedAt(Instant.now());
        return toDetail(disasters.save(disaster));
    }

    @Transactional
    public PastDisasterResponses.Detail update(Long id, PastDisasterWriteRequest request) {
        PastDisaster disaster = find(id);
        if (disasters.existsByEventNameAndIdNot(request.getEventName(), id)) {
            throw new BusinessRuleException("The event name has already been taken.");
        }
        apply(disaster, request);
        if (hasFile(request.getReportDocument())) {
            deleteFile(disaster.getReportDocumentPath());
            disaster.setReportDocumentPath(storeFile(request.getReportDocument()));
        } else if (Boolean.TRUE.equals(request.getRemoveReportDocument())) {
            deleteFile(disaster.getReportDocumentPath());
            disaster.setReportDocumentPath(null);
        }
        return toDetail(disasters.save(disaster));
    }

    @Transactional
    public void destroy(Long id) {
        PastDisaster disaster = find(id);
        deleteFile(disaster.getReportDocumentPath());
        disasters.delete(disaster);
    }

    private PastDisaster find(Long id) {
        return disasters.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Past disaster " + id + " not found"));
    }

    private void apply(PastDisaster disaster, PastDisasterWriteRequest r) {
        if (r.getHazardId() != null && !hazards.existsById(r.getHazardId())) {
            throw new BusinessRuleException("The selected hazard id is invalid.");
        }
        disaster.setEventName(r.getEventName());
        disaster.setEventDate(r.getEventDate());
        disaster.setLocationDescription(r.getLocationDescription());
        disaster.setHazardId(r.getHazardId());
        disaster.setDescriptionOfEvent(r.getDescriptionOfEvent());
        disaster.setImpactDescription(r.getImpactDescription());
        disaster.setLessonsLearned(r.getLessonsLearned());
        disaster.setSourceOfInformation(r.getSourceOfInformation());
        disaster.setLatitude(r.getLatitude() == null ? null : BigDecimal.valueOf(r.getLatitude()));
        disaster.setLongitude(r.getLongitude() == null ? null : BigDecimal.valueOf(r.getLongitude()));
        disaster.setUpdatedAt(Instant.now());
    }

    private static boolean hasFile(MultipartFile file) {
        return file != null && !file.isEmpty();
    }

    /** Mirrors $request->file()->store('past_disaster_reports', 'public') — random name, same dir. */
    private String storeFile(MultipartFile file) {
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        String ext = original.contains(".")
                ? original.substring(original.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
        if (!ALLOWED_EXTENSIONS.contains(ext)) {
            throw new BusinessRuleException("The report document must be a file of type: pdf, doc, docx, txt, jpg, png.");
        }
        if (file.getSize() > MAX_FILE_BYTES) {
            throw new BusinessRuleException("The report document must not be greater than 5120 kilobytes.");
        }
        try {
            Path dir = Path.of(publicRoot, REPORTS_DIR);
            Files.createDirectories(dir);
            String name = UUID.randomUUID() + "." + ext;
            try (var in = file.getInputStream()) {
                Files.copy(in, dir.resolve(name), StandardCopyOption.REPLACE_EXISTING);
            }
            return REPORTS_DIR + "/" + name;
        } catch (IOException e) {
            throw new BusinessRuleException("Failed to store the report document.");
        }
    }

    private void deleteFile(String relativePath) {
        if (!StringUtils.hasText(relativePath)) {
            return;
        }
        try {
            Files.deleteIfExists(Path.of(publicRoot, relativePath));
        } catch (IOException e) {
            // The record operation must not fail because the file is already gone.
        }
    }

    private PastDisasterResponses.Detail toDetail(PastDisaster d) {
        String hazardName = d.getHazardId() == null ? null
                : hazards.findById(d.getHazardId()).map(MitHazard::getName).orElse(null);
        return new PastDisasterResponses.Detail(d.getId(), d.getEventName(),
                d.getEventDate() == null ? null : d.getEventDate().toString(),
                d.getLocationDescription(),
                d.getLatitude() == null ? null : d.getLatitude().doubleValue(),
                d.getLongitude() == null ? null : d.getLongitude().doubleValue(),
                d.getHazardId(), hazardName, d.getDescriptionOfEvent(), d.getImpactDescription(),
                d.getLessonsLearned(), d.getSourceOfInformation(), d.getReportDocumentPath());
    }

    private static String fmt(LocalDate date) {
        return date == null ? null : D_MON_Y.format(date);
    }
}

package tz.go.pmo.dmis.mitigation;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;

/**
 * Reproduces Admin/InfrastructureItemController over the existing {@code infrastructure_items}
 * table: index (paginate 15 latest + 4 stats + geo-located map items + the type optgroups + status
 * options), show, store, update, destroy — a fully working CRUD in the source.
 */
@Service
@RequiredArgsConstructor
public class InfrastructureItemService {

    private static final int PER_PAGE = 15;

    /** Copied verbatim from the controller's $infrastructureTypeGroups. */
    static final Map<String, List<String>> TYPE_GROUPS = new LinkedHashMap<>() {{
        put("Emergency", List.of("Evacuation Center", "Shelter", "Fire Station", "Police Station", "Warehouse"));
        put("Health", List.of("Hospital", "Health Facility"));
        put("Education", List.of("School Building", "Education Facility"));
        put("Energy", List.of("Power Station", "Energy Facility"));
        put("Water", List.of("Water Treatment Plant", "Water Supply Infrastructure"));
        put("Transport", List.of("Bridge", "Road Infrastructure", "Transport Hub", "Port", "Airport"));
        put("Agriculture", List.of("Agricultural Storage", "Irrigation Infrastructure"));
        put("Other", List.of("Communication Tower", "Dam", "Other"));
    }};

    /** Copied verbatim from the controller's $statusOptions. */
    static final List<String> STATUS_OPTIONS =
            List.of("Operational", "Under Maintenance", "At Risk", "Closed", "Planned", "Unknown");

    private final InfrastructureItemRepository items;

    @Transactional(readOnly = true)
    public InfrastructureItemResponses.Index index(int page) {
        Page<InfrastructureItem> result = items.findAllByOrderByCreatedAtDesc(PageRequest.of(Math.max(page, 1) - 1, PER_PAGE));
        List<InfrastructureItemResponses.Row> rows = result.getContent().stream()
                .map(i -> new InfrastructureItemResponses.Row(i.getId(), i.getName(), i.getType(),
                        i.getLocationDescription(), i.getAddress(), i.getCapacity(), i.getStatus()))
                .toList();
        InfrastructureItemResponses.Stats stats = new InfrastructureItemResponses.Stats(
                items.count(),
                items.countByStatus("Operational"),
                items.countByStatus("Under Maintenance"),
                items.countByStatus("At Risk"));
        List<InfrastructureItemResponses.MapItem> mapItems = items.findByLatitudeNotNullAndLongitudeNotNull().stream()
                .map(i -> new InfrastructureItemResponses.MapItem(i.getId(), i.getName(), i.getType(),
                        i.getLatitude().doubleValue(), i.getLongitude().doubleValue(), i.getStatus()))
                .toList();
        int first = result.getTotalElements() == 0 ? 0 : result.getNumber() * PER_PAGE + 1;
        int last = result.getTotalElements() == 0 ? 0 : result.getNumber() * PER_PAGE + result.getNumberOfElements();
        InfrastructureItemResponses.Pagination pagination = new InfrastructureItemResponses.Pagination(
                result.getNumber() + 1, Math.max(result.getTotalPages(), 1), result.getTotalElements(), first, last);
        return new InfrastructureItemResponses.Index(rows, pagination, stats, mapItems, TYPE_GROUPS, STATUS_OPTIONS);
    }

    @Transactional(readOnly = true)
    public InfrastructureItemResponses.Detail show(Long id) {
        return toDetail(find(id));
    }

    @Transactional
    public InfrastructureItemResponses.Detail store(InfrastructureItemWriteRequest request) {
        validateOptions(request);
        InfrastructureItem item = new InfrastructureItem();
        apply(item, request);
        item.setCreatedAt(Instant.now());
        return toDetail(items.save(item));
    }

    @Transactional
    public InfrastructureItemResponses.Detail update(Long id, InfrastructureItemWriteRequest request) {
        validateOptions(request);
        InfrastructureItem item = find(id);
        apply(item, request);
        return toDetail(items.save(item));
    }

    @Transactional
    public void destroy(Long id) {
        items.delete(find(id));
    }

    private InfrastructureItem find(Long id) {
        return items.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Infrastructure item " + id + " not found"));
    }

    /** Rule::in($this->flatTypes()) / Rule::in($this->statusOptions). */
    private void validateOptions(InfrastructureItemWriteRequest r) {
        boolean knownType = TYPE_GROUPS.values().stream().anyMatch(group -> group.contains(r.type()));
        if (!knownType) {
            throw new BusinessRuleException("The selected type is invalid.");
        }
        if (!STATUS_OPTIONS.contains(r.status())) {
            throw new BusinessRuleException("The selected status is invalid.");
        }
    }

    private void apply(InfrastructureItem item, InfrastructureItemWriteRequest r) {
        item.setName(r.name());
        item.setType(r.type());
        item.setLocationDescription(r.locationDescription());
        item.setAddress(r.address());
        item.setLatitude(r.latitude() == null ? null : BigDecimal.valueOf(r.latitude()));
        item.setLongitude(r.longitude() == null ? null : BigDecimal.valueOf(r.longitude()));
        item.setCapacity(r.capacity());
        item.setContactPersonName(r.contactPersonName());
        item.setContactPersonPhone(r.contactPersonPhone());
        item.setContactPersonEmail(r.contactPersonEmail());
        item.setStatus(r.status());
        item.setAdditionalInfo(r.additionalInfo());
        item.setUpdatedAt(Instant.now());
    }

    private InfrastructureItemResponses.Detail toDetail(InfrastructureItem i) {
        return new InfrastructureItemResponses.Detail(i.getId(), i.getName(), i.getType(),
                i.getLocationDescription(), i.getAddress(),
                i.getLatitude() == null ? null : i.getLatitude().doubleValue(),
                i.getLongitude() == null ? null : i.getLongitude().doubleValue(),
                i.getCapacity(), i.getContactPersonName(), i.getContactPersonPhone(),
                i.getContactPersonEmail(), i.getStatus(), i.getAdditionalInfo());
    }
}

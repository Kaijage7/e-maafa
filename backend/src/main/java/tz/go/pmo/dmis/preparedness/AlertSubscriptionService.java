package tz.go.pmo.dmis.preparedness;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Reads + creates alert_subscriptions for the index screen (json channels/hazards). */
@Service
@RequiredArgsConstructor
public class AlertSubscriptionService {

    private static final DateTimeFormatter D_MON_Y = DateTimeFormatter.ofPattern("dd MMM yyyy");

    private final AlertSubscriptionRepository repo;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbc;

    /** Creates a new alert subscriber (auto subscription_id SUB-YYYY-NNNN, json channels/hazards/languages). */
    @Transactional
    public Map<String, Object> create(AlertSubscriptionWriteRequest req) {
        if (req.fullName() == null || req.fullName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Full name is required");
        }
        if ((req.phone() == null || req.phone().isBlank()) && (req.email() == null || req.email().isBlank())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provide at least a phone number or an email");
        }
        // gap-safe code (MAX suffix +1), not count(*)+1 — pairs with the UNIQUE on subscription_id.
        Long seq = jdbc.queryForObject(
                "select coalesce(max(nullif(regexp_replace(substring(subscription_id from 10), '[^0-9]', '', 'g'), '')::int), 0) + 1"
                        + " from public.alert_subscriptions where subscription_id like 'SUB-2026-%'", Long.class);
        String id = String.format("SUB-2026-%04d", seq == null ? 1 : seq);
        jdbc.update("insert into public.alert_subscriptions(subscription_id,full_name,subscriber_location,"
                + "communication_channels,phone_number,email,hazards_of_interest,alert_level_priority,languages,"
                + "consent,is_active,subscribed_at,created_at,updated_at) "
                + "values (?,?,?,?::jsonb,?,?,?::jsonb,?,?::jsonb,?,true,now(),now(),now())",
                id, req.fullName().trim(), blank(req.subscriberLocation()),
                jsonArray(req.channels()), blank(req.phone()), blank(req.email()),
                jsonArray(req.hazards()), blank(req.priority()),
                jsonArray(req.languages() == null || req.languages().isEmpty() ? List.of("English", "Swahili") : req.languages()),
                req.consent() != null && req.consent());
        return Map.of("subscriptionId", id, "message", "Subscriber created");
    }

    /** One subscriber's fields for the edit form. */
    @Transactional(readOnly = true)
    public Map<String, Object> detail(long id) {
        AlertSubscription s = repo.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Subscriber not found"));
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("id", s.getId());
        m.put("subscriptionId", s.getSubscriptionId());
        m.put("fullName", s.getFullName());
        m.put("subscriberLocation", s.getSubscriberLocation());
        m.put("channels", parse(s.getCommunicationChannels()));
        m.put("phone", s.getPhoneNumber());
        m.put("email", s.getEmail());
        m.put("hazards", parse(s.getHazardsOfInterest()));
        m.put("priority", s.getAlertLevelPriority());
        m.put("languages", parse(s.getLanguages()));
        m.put("consent", Boolean.TRUE.equals(s.getConsent()));
        return m;
    }

    /** Updates an existing subscriber (the SUB- code is immutable). */
    @Transactional
    public Map<String, Object> update(long id, AlertSubscriptionWriteRequest req) {
        if (req.fullName() == null || req.fullName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Full name is required");
        }
        if ((req.phone() == null || req.phone().isBlank()) && (req.email() == null || req.email().isBlank())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provide at least a phone number or an email");
        }
        int n = jdbc.update("update public.alert_subscriptions set full_name=?, subscriber_location=?, "
                + "communication_channels=?::jsonb, phone_number=?, email=?, hazards_of_interest=?::jsonb, "
                + "alert_level_priority=?, languages=?::jsonb, consent=?, updated_at=now() where id=?",
                req.fullName().trim(), blank(req.subscriberLocation()),
                jsonArray(req.channels()), blank(req.phone()), blank(req.email()),
                jsonArray(req.hazards()), blank(req.priority()),
                jsonArray(req.languages() == null || req.languages().isEmpty() ? List.of("English", "Swahili") : req.languages()),
                req.consent() != null && req.consent(), id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Subscriber not found");
        }
        return Map.of("id", id, "message", "Subscriber updated");
    }

    private String jsonArray(List<String> list) {
        try {
            return objectMapper.writeValueAsString(list == null ? List.of() : list);
        } catch (Exception e) {
            return "[]";
        }
    }

    private static String blank(String v) {
        return (v == null || v.isBlank()) ? null : v.trim();
    }

    @Transactional(readOnly = true)
    public AlertSubscriptionResponse index() {
        List<AlertSubscription> all = repo.findAllByOrderBySubscribedAtDesc();
        List<AlertSubscriptionResponse.Row> rows = all.stream().map(s -> new AlertSubscriptionResponse.Row(
                s.getId(), s.getSubscriptionId(), s.getFullName(), s.getSubscriberLocation(),
                parse(s.getCommunicationChannels()), s.getPhoneNumber(), s.getEmail(),
                parse(s.getHazardsOfInterest()), s.getAlertLevelPriority(),
                Boolean.TRUE.equals(s.getIsActive()),
                s.getSubscribedAt() == null ? null : D_MON_Y.format(s.getSubscribedAt()))).toList();

        long total = all.size();
        long active = all.stream().filter(s -> Boolean.TRUE.equals(s.getIsActive())).count();
        long sms = all.stream().filter(s -> hasChannel(s, "SMS")).count();
        long email = all.stream().filter(s -> hasChannel(s, "Email")).count();
        return new AlertSubscriptionResponse(rows, new AlertSubscriptionResponse.Stats(total, active, sms, email));
    }

    private boolean hasChannel(AlertSubscription s, String channel) {
        return parse(s.getCommunicationChannels()).stream().anyMatch(c -> c.equalsIgnoreCase(channel));
    }

    private List<String> parse(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() { });
        } catch (Exception e) {
            return List.of(json);
        }
    }
}

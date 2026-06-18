package tz.go.pmo.dmis.repository;

import java.time.Year;
import java.util.Arrays;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * DISASTER REPOSITORY — the national disaster loss database (DesInventar-Sendai event cards).
 *
 * <p>One {@code disaster_events} card per disaster, with per-district
 * {@code disaster_event_effects} records carrying the Sendai-disaggregated figures, and
 * {@code disaster_event_links} binding the card to everything that happened around the
 * disaster inside DMIS (warnings → incidents → assessments → dispatches …).</p>
 *
 * <p>Data entry belongs to EOCC officers; cards move Open → Validated → Archived, and only
 * Validated/Archived figures feed the Sendai analytics ({@link SendaiAnalyticsService}).</p>
 */
@Service
@RequiredArgsConstructor
public class DisasterEventService {

    /** Entity types a card can link to — each maps to a real DMIS table (no dead options). */
    static final Map<String, String> LINKABLE = Map.ofEntries(
            Map.entry("incident", "incidents"),
            Map.entry("early_warning", "early_warnings"),
            Map.entry("threat", "threats"),
            Map.entry("alert", "alerts"),
            Map.entry("damage_assessment", "damage_assessments"),
            Map.entry("response_activation", "response_activations"),
            Map.entry("allocated_resource", "allocated_resources"),
            Map.entry("public_hazard_report", "public_hazard_reports"),
            Map.entry("oh_event", "oh_events"),
            Map.entry("past_disaster", "past_disasters"),
            Map.entry("evacuation_center", "evacuation_centers"));

    private final JdbcTemplate jdbc;

    // ------------------------------------------------------------------ registry

    @Transactional(readOnly = true)
    public Map<String, Object> index(String hazard, String region, Integer year, String status) {
        StringBuilder where = new StringBuilder(" where 1=1");
        List<Object> args = new ArrayList<>();
        if (hazard != null && !hazard.isBlank()) {
            where.append(" and e.hazard_type = ?");
            args.add(hazard);
        }
        if (region != null && !region.isBlank()) {
            where.append(" and (e.primary_region = ? or exists (select 1 from disaster_event_effects x"
                    + " where x.event_id = e.id and x.region = ?))");
            args.add(region);
            args.add(region);
        }
        if (year != null) {
            where.append(" and extract(year from e.started_on) = ?");
            args.add(year);
        }
        if (status != null && !status.isBlank()) {
            where.append(" and e.status = ?");
            args.add(status);
        }
        List<Map<String, Object>> events = jdbc.queryForList(
                "select e.id, e.event_code as \"eventCode\", e.name, e.hazard_type as \"hazardType\","
                        + " to_char(e.started_on,'DD Mon YYYY') as \"startedOn\","
                        + " to_char(e.ended_on,'DD Mon YYYY') as \"endedOn\","
                        + " e.primary_region as \"primaryRegion\", e.scope, e.status,"
                        + " e.recorded_by as \"recordedBy\","
                        + " coalesce((select sum(deaths_total) from disaster_event_effects x where x.event_id=e.id),0) as deaths,"
                        + " coalesce((select sum(directly_affected+displaced) from disaster_event_effects x where x.event_id=e.id),0) as affected,"
                        + " coalesce((select sum(total_loss_tzs) from disaster_event_effects x where x.event_id=e.id),0) as \"lossTzs\","
                        + " (select count(*) from disaster_event_links l where l.event_id=e.id) as \"linkCount\""
                        + " from disaster_events e" + where + " order by e.started_on desc, e.id desc",
                args.toArray());
        Map<String, Object> stats = jdbc.queryForMap(
                "select count(*) as total,"
                        + " count(*) filter (where status='Open') as open,"
                        + " count(*) filter (where status='Validated') as validated,"
                        + " count(*) filter (where status='Archived') as archived from disaster_events");
        return Map.of("events", events, "stats", stats,
                "hazardTypes", jdbc.queryForList("select distinct hazard_type from disaster_events"
                        + " where hazard_type is not null order by 1", String.class));
    }

    // ------------------------------------------------------------------ event card

    @Transactional(readOnly = true)
    public Map<String, Object> show(long id) {
        Map<String, Object> event = one(id);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("event", event);
        out.put("effects", jdbc.queryForList(
                "select * from disaster_event_effects where event_id = ? order by region, district", id));
        out.put("links", linkedRecords(id));
        out.put("totals", jdbc.queryForMap(
                "select coalesce(sum(deaths_total),0) as deaths, coalesce(sum(missing_total),0) as missing,"
                        + " coalesce(sum(injured_total),0) as injured,"
                        + " coalesce(sum(directly_affected),0) as \"directlyAffected\","
                        + " coalesce(sum(displaced),0) as displaced,"
                        + " coalesce(sum(houses_destroyed),0) as \"housesDestroyed\","
                        + " coalesce(sum(houses_damaged),0) as \"housesDamaged\","
                        + " coalesce(sum(total_loss_tzs),0) as \"totalLossTzs\","
                        + " coalesce(sum(schools_damaged),0) as schools,"
                        + " coalesce(sum(health_facilities_damaged),0) as \"healthFacilities\","
                        + " coalesce(sum(roads_km_damaged),0) as \"roadsKm\","
                        + " coalesce(sum(households_affected),0) as households,"
                        + " coalesce(sum(classrooms_damaged),0) as classrooms,"
                        + " coalesce(sum(religious_facilities_damaged),0) as \"religiousFacilities\","
                        + " coalesce(sum(roads_damaged),0) as \"roadsCount\","
                        + " coalesce(sum(livestock_lost),0) as \"livestockLost\","
                        + " coalesce(sum(crops_destroyed_ha),0) as \"cropsHa\""
                        + " from disaster_event_effects where event_id = ?", id));
        out.put("responseInvestment", responseInvestment(id));
        return out;
    }

    @Transactional
    public Map<String, Object> create(Map<String, Object> req, String actor) {
        String name = str(req.get("name"));
        String startedOn = str(req.get("startedOn"));
        if (name == null || startedOn == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Event name and start date are required");
        }
        // M2: validate the start date is a real ISO date BEFORE using it — a range/garbage date
        // (e.g. "2025-12-24/25-26" or "2026") otherwise blew up as a 500 (substring) or a misleading 409.
        final java.time.LocalDate start;
        try {
            start = java.time.LocalDate.parse(startedOn);
        } catch (java.time.format.DateTimeParseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Start date must be a valid ISO date (YYYY-MM-DD)");
        }
        if (str(req.get("endedOn")) != null) {
            try { java.time.LocalDate.parse(str(req.get("endedOn"))); }
            catch (java.time.format.DateTimeParseException ex) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "End date must be a valid ISO date (YYYY-MM-DD)");
            }
        }
        int year = start.getYear();
        // B2: gap-safe code generation — MAX numeric suffix of THIS year's DE- codes (+1), not count(*)+1
        // (count() leaves a permanent gap after any delete → every later create collided on the UNIQUE code).
        Long seq = jdbc.queryForObject(
                "select coalesce(max(nullif(regexp_replace(substring(event_code from 9), '[^0-9]', '', 'g'), '')::int), 0) + 1"
                        + " from disaster_events where event_code like ?", Long.class, "DE-" + year + "-%");
        String code = String.format("DE-%d-%04d", year, seq == null ? 1 : seq);
        Long hazardId = req.get("hazardId") == null || str(req.get("hazardId")) == null
                ? null : Long.valueOf(String.valueOf(req.get("hazardId")));
        String hazardType = hazardId == null ? str(req.get("hazardType"))
                : jdbc.queryForObject("select name from hazards where id = ?", String.class, hazardId);
        Long id = jdbc.queryForObject(
                "insert into disaster_events(event_code,name,hazard_id,hazard_type,glide_number,started_on,"
                        + "ended_on,primary_region,scope,description,triggering_event,data_source,status,"
                        + "recorded_by,created_at,updated_at)"
                        + " values (?,?,?,?,?,?::date,?::date,?,?,?,?,?,'Open',?,now(),now()) returning id",
                Long.class, code, name, hazardId, hazardType, str(req.get("glideNumber")), startedOn,
                str(req.get("endedOn")), str(req.get("primaryRegion")),
                str(req.get("scope")) == null ? "District" : str(req.get("scope")),
                str(req.get("description")), str(req.get("triggeringEvent")), str(req.get("dataSource")), actor);
        return Map.of("id", id, "eventCode", code);
    }

    @Transactional
    public void update(long id, Map<String, Object> req) {
        requireEditable(id);
        jdbc.update("update disaster_events set name=coalesce(?,name), glide_number=coalesce(?,glide_number),"
                        + " started_on=coalesce(?::date,started_on), ended_on=coalesce(?::date,ended_on),"
                        + " primary_region=coalesce(?,primary_region), scope=coalesce(?,scope),"
                        + " description=coalesce(?,description), triggering_event=coalesce(?,triggering_event),"
                        + " data_source=coalesce(?,data_source), updated_at=now() where id=?",
                str(req.get("name")), str(req.get("glideNumber")), str(req.get("startedOn")),
                str(req.get("endedOn")), str(req.get("primaryRegion")), str(req.get("scope")),
                str(req.get("description")), str(req.get("triggeringEvent")), str(req.get("dataSource")), id);
    }

    /** Open → Validated → Archived (validation freezes figures into the Sendai analytics). */
    @Transactional
    public Map<String, Object> transition(long id, String action, String actor) {
        Map<String, Object> e = one(id);
        String status = String.valueOf(e.get("status"));
        switch (action) {
            case "validate" -> {
                if (!"Open".equals(status)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "Only Open cards can be validated");
                }
                Long effects = jdbc.queryForObject(
                        "select count(*) from disaster_event_effects where event_id=?", Long.class, id);
                if (effects == null || effects == 0) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "Add at least one effects record before validating");
                }
                jdbc.update("update disaster_events set status='Validated', validated_by=?, validated_at=now(),"
                        + " updated_at=now() where id=?", actor, id);
            }
            case "reopen" -> jdbc.update("update disaster_events set status='Open', validated_by=null,"
                    + " validated_at=null, updated_at=now() where id=?", id);
            case "archive" -> {
                if (!"Validated".equals(status)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "Only Validated cards can be archived");
                }
                jdbc.update("update disaster_events set status='Archived', updated_at=now() where id=?", id);
            }
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown action " + action);
        }
        return Map.of("id", id, "status", jdbc.queryForObject(
                "select status from disaster_events where id=?", String.class, id));
    }

    /** Open cards only — validated history is never deleted, it is reopened and corrected. */
    @Transactional
    public void delete(long id) {
        requireEditable(id);
        jdbc.update("delete from disaster_events where id = ?", id);
    }

    // ------------------------------------------------------------------ effects records

    @Transactional
    public Map<String, Object> saveEffects(long eventId, Map<String, Object> r) {
        requireEditable(eventId);
        String region = str(r.get("region"));
        if (region == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Region is required");
        }
        Object existing = r.get("id");
        long total = i(r, "deathsMale") + i(r, "deathsFemale");
        long deathsTotal = i(r, "deathsTotal") > 0 ? i(r, "deathsTotal") : total;
        double lossTotal = d(r, "agricultureLossTzs") + d(r, "housingLossTzs")
                + d(r, "infrastructureLossTzs") + d(r, "otherLossTzs");
        Object[] values = {
            region, str(r.get("district")),
            i(r, "deathsMale"), i(r, "deathsFemale"), deathsTotal, i(r, "missingTotal"),
            i(r, "injuredTotal"), i(r, "directlyAffected"), i(r, "displaced"), i(r, "relocated"),
            i(r, "childrenAffected"), i(r, "pwdAffected"), i(r, "housesDestroyed"), i(r, "housesDamaged"),
            d(r, "agricultureLossTzs"), i(r, "livestockLost"), d(r, "cropsDestroyedHa"),
            d(r, "housingLossTzs"), d(r, "infrastructureLossTzs"), d(r, "otherLossTzs"), lossTotal,
            i(r, "schoolsDamaged"), i(r, "healthFacilitiesDamaged"), d(r, "roadsKmDamaged"),
            i(r, "bridgesDamaged"), i(r, "waterSystemsDamaged"), i(r, "powerSystemsDamaged"),
            str(r.get("servicesDisrupted")), str(r.get("notes")), str(r.get("source")),
            // V61 official-report columns (KAYA / MADARASA / MAKANISA / BARABARA-count)
            i(r, "householdsAffected"), i(r, "classroomsDamaged"), i(r, "religiousFacilitiesDamaged"), i(r, "roadsDamaged"),
        };
        if (existing != null) {
            List<Object> args = new ArrayList<>(Arrays.asList(values));
            args.add(Long.valueOf(String.valueOf(existing)));
            args.add(eventId);
            jdbc.update("update disaster_event_effects set region=?, district=?,"
                    + " deaths_male=?, deaths_female=?, deaths_total=?, missing_total=?,"
                    + " injured_total=?, directly_affected=?, displaced=?, relocated=?,"
                    + " children_affected=?, pwd_affected=?, houses_destroyed=?, houses_damaged=?,"
                    + " agriculture_loss_tzs=?, livestock_lost=?, crops_destroyed_ha=?,"
                    + " housing_loss_tzs=?, infrastructure_loss_tzs=?, other_loss_tzs=?, total_loss_tzs=?,"
                    + " schools_damaged=?, health_facilities_damaged=?, roads_km_damaged=?,"
                    + " bridges_damaged=?, water_systems_damaged=?, power_systems_damaged=?,"
                    + " services_disrupted=?, notes=?, source=?,"
                    + " households_affected=?, classrooms_damaged=?, religious_facilities_damaged=?, roads_damaged=?,"
                    + " updated_at=now()"
                    + " where id=? and event_id=?", args.toArray());
            return Map.of("id", existing, "message", "Effects record updated");
        }
        List<Object> args = new ArrayList<>();
        args.add(eventId);
        args.addAll(Arrays.asList(values));
        Long id = jdbc.queryForObject("insert into disaster_event_effects(event_id, region, district,"
                + " deaths_male, deaths_female, deaths_total, missing_total,"
                + " injured_total, directly_affected, displaced, relocated,"
                + " children_affected, pwd_affected, houses_destroyed, houses_damaged,"
                + " agriculture_loss_tzs, livestock_lost, crops_destroyed_ha,"
                + " housing_loss_tzs, infrastructure_loss_tzs, other_loss_tzs, total_loss_tzs,"
                + " schools_damaged, health_facilities_damaged, roads_km_damaged,"
                + " bridges_damaged, water_systems_damaged, power_systems_damaged,"
                + " services_disrupted, notes, source,"
                + " households_affected, classrooms_damaged, religious_facilities_damaged, roads_damaged,"
                + " created_at, updated_at)"
                + " values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,now(),now())"
                + " returning id", Long.class, args.toArray());
        return Map.of("id", id, "message", "Effects record added");
    }

    @Transactional
    public void deleteEffects(long eventId, long effectsId) {
        requireEditable(eventId);
        jdbc.update("delete from disaster_event_effects where id=? and event_id=?", effectsId, eventId);
    }

    // ------------------------------------------------------------------ links

    @Transactional
    public Map<String, Object> addLink(long eventId, String entityType, long entityId, String note, String actor) {
        String table = LINKABLE.get(entityType);
        if (table == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown entity type " + entityType);
        }
        Long exists = jdbc.queryForObject("select count(*) from " + table + " where id=?", Long.class, entityId);
        if (exists == null || exists == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, entityType + " " + entityId + " not found");
        }
        jdbc.update("insert into disaster_event_links(event_id,entity_type,entity_id,note,linked_by,created_at)"
                        + " values (?,?,?,?,?,now()) on conflict on constraint uq_event_entity do nothing",
                eventId, entityType, entityId, note, actor);
        return Map.of("message", "Linked");
    }

    @Transactional
    public void removeLink(long eventId, long linkId) {
        jdbc.update("delete from disaster_event_links where id=? and event_id=?", linkId, eventId);
    }

    /**
     * Candidate records for linking: hazard-matched incidents/warnings/assessments inside the
     * event window (±14 days), not yet linked — the "capture the invisible" helper so EOCC
     * officers see what the system already knows about this disaster.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> linkSuggestions(long eventId) {
        Map<String, Object> e = one(eventId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("incident", jdbc.queryForList(
                "select i.id, i.title as label, i.region_name as detail,"
                        + " to_char(i.reported_at,'DD Mon YYYY') as \"when\" from incidents i"
                        + " where i.reported_at between (?::date - interval '14 days')"
                        + "   and (coalesce(?::date, ?::date) + interval '14 days')"
                        + " and not exists (select 1 from disaster_event_links l where l.event_id=?"
                        + "   and l.entity_type='incident' and l.entity_id=i.id)"
                        + " order by i.reported_at desc limit 12",
                e.get("startedOn"), e.get("endedOn"), e.get("startedOn"), eventId));
        out.put("early_warning", jdbc.queryForList(
                "select w.id, coalesce(w.warning_code, w.hazard_type) as label, w.affected_regions as detail,"
                        + " to_char(w.created_at,'DD Mon YYYY') as \"when\" from early_warnings w"
                        + " where w.created_at between (?::date - interval '30 days')"
                        + "   and (coalesce(?::date, ?::date) + interval '14 days')"
                        + " and not exists (select 1 from disaster_event_links l where l.event_id=?"
                        + "   and l.entity_type='early_warning' and l.entity_id=w.id)"
                        + " order by w.created_at desc limit 12",
                e.get("startedOn"), e.get("endedOn"), e.get("startedOn"), eventId));
        out.put("damage_assessment", jdbc.queryForList(
                "select a.id, concat(a.assessment_type,' — ',coalesce(a.district, a.location)) as label,"
                        + " concat('Est. loss TZS ', coalesce(a.estimated_loss,0)) as detail,"
                        + " to_char(a.assessment_date,'DD Mon YYYY') as \"when\" from damage_assessments a"
                        + " where a.assessment_date between (?::date - interval '14 days')"
                        + "   and (coalesce(?::date, ?::date) + interval '60 days')"
                        + " and not exists (select 1 from disaster_event_links l where l.event_id=?"
                        + "   and l.entity_type='damage_assessment' and l.entity_id=a.id)"
                        + " order by a.assessment_date desc limit 12",
                e.get("startedOn"), e.get("endedOn"), e.get("startedOn"), eventId));
        out.put("threat", jdbc.queryForList(
                "select t.id, t.name as label, t.source_agency as detail, '' as \"when\" from threats t"
                        + " where not exists (select 1 from disaster_event_links l where l.event_id=?"
                        + "   and l.entity_type='threat' and l.entity_id=t.id)", eventId));
        return out;
    }

    /**
     * Pre-fills an effects record from the linked operational records: casualty figures
     * aggregated from linked incidents (+ their latest history reports) and economic loss
     * from linked damage assessments. EOCC reviews and saves — the system never silently
     * writes Sendai figures.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> pullFromLinks(long eventId) {
        Map<String, Object> incident = jdbc.queryForMap(
                "select coalesce(sum(i.deaths_male),0) as \"deathsMale\","
                        + " coalesce(sum(i.deaths_female),0) as \"deathsFemale\","
                        + " coalesce(sum(i.deaths_total),0) as \"deathsTotal\","
                        + " coalesce(sum(i.missing_total),0) as \"missingTotal\","
                        + " coalesce(sum(i.injured_total),0) as \"injuredTotal\","
                        + " coalesce(sum(i.displaced),0) as displaced,"
                        + " coalesce(sum(i.children_affected),0) as \"childrenAffected\","
                        + " coalesce(sum(i.people_with_disabilities),0) as \"pwdAffected\","
                        + " count(*) as \"incidentCount\","
                        + " string_agg(distinct i.region_name, ', ') as regions"
                        + " from incidents i join disaster_event_links l on l.entity_type='incident'"
                        + " and l.entity_id=i.id where l.event_id=?", eventId);
        Map<String, Object> assessment = jdbc.queryForMap(
                "select coalesce(sum(a.estimated_loss),0) as \"estimatedLossTzs\", count(*) as \"assessmentCount\""
                        + " from damage_assessments a join disaster_event_links l"
                        + " on l.entity_type='damage_assessment' and l.entity_id=a.id where l.event_id=?", eventId);
        return Map.of("fromIncidents", incident, "fromAssessments", assessment,
                "note", "Review the aggregated figures, assign them to the correct region/district, then save");
    }

    // ------------------------------------------------------------------ internals

    /** Everything linked to the card, joined to its source table for a human label. */
    private List<Map<String, Object>> linkedRecords(long eventId) {
        return jdbc.queryForList(
                "select l.id, l.entity_type as \"entityType\", l.entity_id as \"entityId\", l.note,"
                        + " l.linked_by as \"linkedBy\", to_char(l.created_at,'DD Mon YYYY') as \"linkedOn\","
                        + " case l.entity_type"
                        + "   when 'incident' then (select title from incidents where id=l.entity_id)"
                        + "   when 'early_warning' then (select coalesce(warning_code, hazard_type)"
                        + "     from early_warnings where id=l.entity_id)"
                        + "   when 'threat' then (select name from threats where id=l.entity_id)"
                        + "   when 'alert' then (select title from alerts where id=l.entity_id)"
                        + "   when 'damage_assessment' then (select concat(assessment_type,' — ',"
                        + "     coalesce(district, location)) from damage_assessments where id=l.entity_id)"
                        + "   when 'response_activation' then (select concat('Activation #', id)"
                        + "     from response_activations where id=l.entity_id)"
                        + "   when 'allocated_resource' then (select concat('Allocation #', id)"
                        + "     from allocated_resources where id=l.entity_id)"
                        + "   when 'public_hazard_report' then (select report_code from public_hazard_reports"
                        + "     where id=l.entity_id)"
                        + "   when 'oh_event' then (select concat('One Health event #', id) from oh_events"
                        + "     where id=l.entity_id)"
                        + "   when 'past_disaster' then (select event_name from past_disasters where id=l.entity_id)"
                        + "   when 'evacuation_center' then (select centre_name from evacuation_centers"
                        + "     where id=l.entity_id)"
                        + "   else concat(l.entity_type, ' #', l.entity_id) end as label"
                        + " from disaster_event_links l where l.event_id=? order by l.created_at", eventId);
    }

    /**
     * What the response cost: dispatched quantities × unit cost for allocations tied to linked
     * incidents — the "DMD intervention value" figure the analytics surfaces per event.
     */
    private Map<String, Object> responseInvestment(long eventId) {
        return jdbc.queryForMap(
                "select coalesce(sum(ar.quantity_allocated * coalesce(r.unit_cost,0)),0) as \"valueTzs\","
                        + " count(distinct ar.id) as allocations,"
                        + " count(distinct ar.resource_id) as \"resourceTypes\""
                        + " from allocated_resources ar"
                        + " join resources r on r.id = ar.resource_id"
                        + " where ar.incident_id in (select entity_id from disaster_event_links"
                        + "   where event_id=? and entity_type='incident')"
                        + " or ar.id in (select entity_id from disaster_event_links"
                        + "   where event_id=? and entity_type='allocated_resource')", eventId, eventId);
    }

    private Map<String, Object> one(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, event_code as \"eventCode\", name, hazard_id as \"hazardId\","
                        + " hazard_type as \"hazardType\", glide_number as \"glideNumber\","
                        + " to_char(started_on,'YYYY-MM-DD') as \"startedOn\","
                        + " to_char(ended_on,'YYYY-MM-DD') as \"endedOn\","
                        + " primary_region as \"primaryRegion\", scope, description,"
                        + " triggering_event as \"triggeringEvent\", data_source as \"dataSource\", status,"
                        + " recorded_by as \"recordedBy\", validated_by as \"validatedBy\","
                        + " to_char(validated_at,'DD Mon YYYY') as \"validatedAt\""
                        + " from disaster_events where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Event not found");
        }
        return rows.get(0);
    }

    /** Validated/Archived cards are frozen — figures feeding Sendai reports must not drift. */
    private void requireEditable(long id) {
        List<String> status = jdbc.queryForList(
                "select status from disaster_events where id=?", String.class, id);
        if (status.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Event not found");
        }
        if (!"Open".equals(status.get(0))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Card is " + status.get(0) + " — reopen it before editing");
        }
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static long i(Map<String, Object> r, String key) {
        try {
            return r.get(key) == null ? 0 : (long) Double.parseDouble(String.valueOf(r.get(key)));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static double d(Map<String, Object> r, String key) {
        try {
            return r.get(key) == null ? 0 : Double.parseDouble(String.valueOf(r.get(key)));
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}

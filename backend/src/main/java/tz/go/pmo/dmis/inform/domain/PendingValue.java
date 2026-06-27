package tz.go.pmo.dmis.inform.domain;

/**
 * One submission awaiting PMO approval, enriched with indicator/area names so the approver has context
 * without extra lookups. The governance step: a sector keys a raw value → it lands here as pending →
 * a PMO approver promotes it to the authoritative (approved, isLatest) value the composite/signals use.
 */
public record PendingValue(
        Long id,
        String indicatorId,
        String indicatorName,
        String component,
        String owner,
        String areaCode,
        String areaName,
        Double rawValue,
        Double value0to10,
        String submittedBy,
        String ts) {}

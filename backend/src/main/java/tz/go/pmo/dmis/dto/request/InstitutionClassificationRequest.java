package tz.go.pmo.dmis.dto.request;

/**
 * Governance-only fields for an agency or stakeholder (class, policy role, M&amp;E flag).
 */
public record InstitutionClassificationRequest(
        String institutionClass,
        String institutionSubclass,
        String sectorTags,
        Boolean meRequired,
        String policyRoleCode,
        String roleSummary,
        String sourceReference) {
}

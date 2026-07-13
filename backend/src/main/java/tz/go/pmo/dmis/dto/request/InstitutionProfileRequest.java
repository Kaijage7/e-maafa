package tz.go.pmo.dmis.dto.request;

/**
 * Full institution profile edit from System Settings (names, contacts, class, active, M&amp;E).
 */
public record InstitutionProfileRequest(
        String name,
        String acronym,
        String type,
        String institutionClass,
        String institutionSubclass,
        String sectorTags,
        String policyRoleCode,
        String roleSummary,
        String sourceReference,
        String contactPersonName,
        String contactPersonEmail,
        String contactPersonPhone,
        String address,
        String website,
        Boolean meRequired,
        Boolean isActive) {
}

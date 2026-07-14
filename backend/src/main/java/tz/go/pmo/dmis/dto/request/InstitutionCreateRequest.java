package tz.go.pmo.dmis.dto.request;

/**
 * Create an institution row in the agency or stakeholder registry (System Settings).
 */
public record InstitutionCreateRequest(
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
        Boolean meRequired) {
}

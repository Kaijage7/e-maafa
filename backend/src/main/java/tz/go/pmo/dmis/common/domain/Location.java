package tz.go.pmo.dmis.common.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Shared-kernel geographic anchor used across contexts (people, incidents, warnings, stock).
 *
 * <p>Codes reference the authoritative Region → District → Ward → Village geography; names are
 * denormalised for display and reporting; optional lat/long supports spatial overlap queries
 * (e.g. which registered households fall inside a warning polygon). Embedded on its owners rather
 * than a cross-schema FK to the legacy geography tables.
 */
@Getter
@Builder
@Embeddable
@NoArgsConstructor
@AllArgsConstructor
public class Location {

    @Column(name = "region_code", length = 10)
    private String regionCode;

    @Column(name = "region_name", length = 100)
    private String regionName;

    @Column(name = "district_code", length = 10)
    private String districtCode;

    @Column(name = "district_name", length = 100)
    private String districtName;

    @Column(name = "ward_code", length = 15)
    private String wardCode;

    @Column(name = "ward_name", length = 100)
    private String wardName;

    @Column(name = "village_name", length = 120)
    private String villageName;

    @Column(name = "latitude")
    private Double latitude;

    @Column(name = "longitude")
    private Double longitude;
}

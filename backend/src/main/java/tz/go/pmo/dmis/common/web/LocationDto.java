package tz.go.pmo.dmis.common.web;

import tz.go.pmo.dmis.common.domain.Location;

/** Shared API representation of the {@link Location} value object (request and response). */
public record LocationDto(
        String regionCode,
        String regionName,
        String districtCode,
        String districtName,
        String wardCode,
        String wardName,
        String villageName,
        Double latitude,
        Double longitude) {

    public Location toDomain() {
        return Location.builder()
                .regionCode(regionCode)
                .regionName(regionName)
                .districtCode(districtCode)
                .districtName(districtName)
                .wardCode(wardCode)
                .wardName(wardName)
                .villageName(villageName)
                .latitude(latitude)
                .longitude(longitude)
                .build();
    }

    public static LocationDto from(Location location) {
        if (location == null) {
            return null;
        }
        return new LocationDto(
                location.getRegionCode(),
                location.getRegionName(),
                location.getDistrictCode(),
                location.getDistrictName(),
                location.getWardCode(),
                location.getWardName(),
                location.getVillageName(),
                location.getLatitude(),
                location.getLongitude());
    }
}

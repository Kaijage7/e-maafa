package tz.go.pmo.dmis.dto.request;

import java.util.List;

/** Payload for creating or updating an alert subscriber. */
public record AlertSubscriptionWriteRequest(
        String fullName,
        String subscriberLocation,
        List<String> channels,
        String phone,
        String email,
        List<String> hazards,
        String priority,
        List<String> languages,
        Boolean consent) {
}

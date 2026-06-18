package tz.go.pmo.dmis.preparedness;

import java.util.List;

/** Payload for the Alert Subscriptions index: rows + four stat-card values. */
public record AlertSubscriptionResponse(List<Row> subscriptions, Stats stats) {

    public record Stats(long total, long active, long sms, long email) {
    }

    public record Row(Long id, String subscriptionId, String fullName, String location, List<String> channels,
                      String phone, String email, List<String> hazards, String priority,
                      boolean active, String subscribed) {
    }
}

package tz.go.pmo.dmis.common.idempotency;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

class ApiIdempotencyFingerprintTest {

    private final ApiIdempotencyService service = new ApiIdempotencyService(
            null, null, new ObjectMapper(), Duration.ofDays(30), 100);

    @Test
    void canonicalizesFormMapOrderButHashesEveryUploadedByte() {
        Map<String, String> firstOrder = new LinkedHashMap<>();
        firstOrder.put("title", "Flood report");
        firstOrder.put("hazard_id", "7");
        Map<String, String> secondOrder = new LinkedHashMap<>();
        secondOrder.put("hazard_id", "7");
        secondOrder.put("title", "Flood report");

        MockMultipartFile firstPhoto = new MockMultipartFile(
                "photos", "evidence.jpg", "image/jpeg", new byte[]{1, 2, 3, 4});
        MockMultipartFile sameRequest = new MockMultipartFile(
                "photos", "evidence.jpg", "image/jpeg", new byte[]{1, 2, 3, 4});
        MockMultipartFile sameBytesAnotherName = new MockMultipartFile(
                "photos", "renamed.jpg", "image/jpeg", new byte[]{1, 2, 3, 4});
        MockMultipartFile changedSameSize = new MockMultipartFile(
                "photos", "evidence.jpg", "image/jpeg", new byte[]{1, 2, 3, 5});

        String first = service.fingerprintIncidentCreate(
                firstOrder, List.of("roads"), List.of("water"), List.of(firstPhoto), null);
        String reordered = service.fingerprintIncidentCreate(
                secondOrder, List.of("roads"), List.of("water"), List.of(sameRequest), null);
        String renamed = service.fingerprintIncidentCreate(
                secondOrder, List.of("roads"), List.of("water"), List.of(sameBytesAnotherName), null);
        String changed = service.fingerprintIncidentCreate(
                secondOrder, List.of("roads"), List.of("water"), List.of(changedSameSize), null);

        assertThat(reordered).isEqualTo(first);
        assertThat(renamed).isNotEqualTo(first);
        assertThat(changed).isNotEqualTo(first);
        assertThat(first).matches("[0-9a-f]{64}");
    }

    @Test
    void listOrderRemainsPartOfTheLogicalPayload() {
        String first = service.fingerprintIncidentCreate(
                Map.of("title", "Flood report"), List.of("roads", "bridges"), List.of(), List.of(), null);
        String reordered = service.fingerprintIncidentCreate(
                Map.of("title", "Flood report"), List.of("bridges", "roads"), List.of(), List.of(), null);

        assertThat(reordered).isNotEqualTo(first);
    }
}

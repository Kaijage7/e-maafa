package tz.go.pmo.dmis.notification;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import org.junit.jupiter.api.Test;

/** Unit coverage for F59/F60 DLR status normalisation (no Spring context). */
class DeliveryStatusMappingTest {

    @Test
    void mapsCommonGatewayStatuses() throws Exception {
        Method m = DeliveryStatusController.class.getDeclaredMethod("mapStatus", String.class);
        m.setAccessible(true);
        assertThat(m.invoke(null, "DELIVERED")).isEqualTo("delivered");
        assertThat(m.invoke(null, "DELIVRD")).isEqualTo("delivered"); // SMPP classic
        assertThat(m.invoke(null, "dlvrd")).isEqualTo("delivered");
        assertThat(m.invoke(null, "Success")).isEqualTo("delivered");
        assertThat(m.invoke(null, "failed")).isEqualTo("failed");
        assertThat(m.invoke(null, "UNDELIV")).isEqualTo("failed");
        assertThat(m.invoke(null, "sent")).isEqualTo("sent");
        assertThat(m.invoke(null, "pending")).isEqualTo("pending");
        assertThat(m.invoke(null, (Object) null)).isEqualTo("delivered");
        assertThat(m.invoke(null, "weird-unknown-xyz")).isNull();
    }
}

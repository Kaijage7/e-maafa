package tz.go.pmo.dmis.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

class GraphQlWebSocketConfigTest {

    @Test
    void appliesTheReviewedGraphQlMessageBoundToTheServletContainer() {
        ServletServerContainerFactoryBean container =
                new GraphQlWebSocketConfig().graphQlWebSocketContainer(65_536);

        assertThat(container.getMaxTextMessageBufferSize()).isEqualTo(65_536);
        assertThat(container.getMaxBinaryMessageBufferSize()).isEqualTo(1_024);
    }

    @Test
    void rejectsAnUnsafeTinyMessageConfiguration() {
        assertThatThrownBy(() -> new GraphQlWebSocketConfig().graphQlWebSocketContainer(1_023))
                .isInstanceOf(IllegalArgumentException.class);
    }
}

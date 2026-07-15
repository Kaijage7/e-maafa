package tz.go.pmo.dmis.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

/** Explicit servlet-container bounds for the native GraphQL WebSocket transport. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(
        name = "dmis.graphql.websocket-container-enabled",
        havingValue = "true",
        matchIfMissing = true)
public class GraphQlWebSocketConfig {

    @Bean
    ServletServerContainerFactoryBean graphQlWebSocketContainer(
            @Value("${dmis.graphql.max-request-bytes:65536}") int maxTextMessageBytes) {
        if (maxTextMessageBytes < 1024) {
            throw new IllegalArgumentException("dmis.graphql.max-request-bytes must be at least 1024");
        }
        ServletServerContainerFactoryBean container = new ServletServerContainerFactoryBean();
        container.setMaxTextMessageBufferSize(maxTextMessageBytes);
        // graphql-transport-ws is text-only. Keep any unexpected binary frame tightly bounded; the
        // GraphQL handler will reject it as a protocol error rather than buffering a large payload.
        container.setMaxBinaryMessageBufferSize(1024);
        return container;
    }
}

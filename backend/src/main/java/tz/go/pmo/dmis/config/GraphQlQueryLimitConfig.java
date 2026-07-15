package tz.go.pmo.dmis.config;

import graphql.analysis.MaxQueryComplexityInstrumentation;
import graphql.analysis.MaxQueryDepthInstrumentation;
import graphql.execution.instrumentation.Instrumentation;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.graphql.server.TimeoutWebGraphQlInterceptor;
import org.springframework.graphql.server.WebGraphQlInterceptor;

/** Global resource limits for the additive GraphQL read surface. */
@Configuration(proxyBeanMethods = false)
public class GraphQlQueryLimitConfig {

    @Bean
    Instrumentation graphQlMaxQueryDepth(
            @Value("${dmis.graphql.max-query-depth:8}") int maxDepth) {
        return new MaxQueryDepthInstrumentation(requirePositive("max-query-depth", maxDepth));
    }

    @Bean
    Instrumentation graphQlMaxQueryComplexity(
            @Value("${dmis.graphql.max-query-complexity:100}") int maxComplexity) {
        int limit = requirePositive("max-query-complexity", maxComplexity);
        return new MaxQueryComplexityInstrumentation(limit, (environment, childComplexity) -> {
            // mobileHome performs several already-scoped SQL reads as one screen aggregate. Give it
            // a realistic fixed cost so aliases cannot multiply those reads while appearing cheap.
            String field = environment.getFieldDefinition().getName();
            // Composite reads hit several already-scoped SQL queries; keep alias amplification expensive.
            int ownCost = ("mobileHome".equals(field) || "incidentWorkspace".equals(field)) ? 50 : 1;
            return Math.addExact(ownCost, childComplexity);
        });
    }

    @Bean
    WebGraphQlInterceptor graphQlRequestTimeout(
            @Value("${dmis.graphql.request-timeout:20s}") Duration timeout) {
        if (timeout.isZero() || timeout.isNegative()) {
            throw new IllegalArgumentException("dmis.graphql.request-timeout must be greater than zero");
        }
        return new TimeoutWebGraphQlInterceptor(timeout);
    }

    private static int requirePositive(String property, int value) {
        if (value < 1) {
            throw new IllegalArgumentException("dmis.graphql." + property + " must be greater than zero");
        }
        return value;
    }
}

package tz.go.pmo.dmis.graphql;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * Locks the hybrid transport boundary: GraphQL stays a small, read-shaped surface; domain
 * writes and durable recovery remain REST (and are not declared in the GraphQL schema).
 */
class GraphQlTransportBoundaryTest {

    /** Top-level fields in a type block use two-space indent; args use deeper indent. */
    private static final Pattern FIELD = Pattern.compile(
            "(?m)^  ([A-Za-z_][A-Za-z0-9_]*)\\s*[\\(:]");

    @Test
    void schemaHasNoMutationType() throws Exception {
        String schema = Files.readString(schemaPath());
        assertThat(schema).doesNotContain("type Mutation");
        assertThat(schema.toLowerCase()).doesNotContain("mutation {");
    }

    @Test
    void queryAndSubscriptionRootsMatchTheProductAllowlist() throws Exception {
        String schema = Files.readString(schemaPath());
        Set<String> queryRoots = fieldsInType(schema, "Query");
        Set<String> subscriptionRoots = fieldsInType(schema, "Subscription");

        assertThat(queryRoots)
                .as("GraphQL queries are only composite mobile/web reads")
                .containsExactlyInAnyOrder("mobileHome", "incidentWorkspace");
        assertThat(subscriptionRoots)
                .as("GraphQL subscriptions are only content-free foreground wake-ups")
                .containsExactly("mobileSync");

        assertThat(PersistedOperationRegistry.ALLOWED_ROOT_FIELDS)
                .containsAll(queryRoots)
                .containsAll(subscriptionRoots)
                .hasSize(queryRoots.size() + subscriptionRoots.size());
    }

    @Test
    void schemaPreambleStatesCommandsRemainOnRest() throws Exception {
        String schema = Files.readString(schemaPath());
        assertThat(schema).containsIgnoringCase("Commands remain on REST");
    }

    private static Path schemaPath() {
        Path[] candidates = {
                Path.of("src/main/resources/graphql/mobile.graphqls"),
                Path.of("backend/src/main/resources/graphql/mobile.graphqls"),
                Path.of("dmis-platform/backend/src/main/resources/graphql/mobile.graphqls"),
        };
        for (Path p : candidates) {
            if (Files.isRegularFile(p)) {
                return p;
            }
        }
        throw new IllegalStateException("mobile.graphqls not found from test cwd");
    }

    private static Set<String> fieldsInType(String schema, String typeName) {
        int typeAt = schema.indexOf("type " + typeName);
        assertThat(typeAt).as("type " + typeName).isGreaterThanOrEqualTo(0);
        int open = schema.indexOf('{', typeAt);
        int close = schema.indexOf('}', open);
        String body = schema.substring(open + 1, close);
        return FIELD.matcher(body).results()
                .map(m -> m.group(1))
                .filter(name -> !name.equals(typeName))
                .collect(Collectors.toCollection(java.util.LinkedHashSet::new));
    }
}

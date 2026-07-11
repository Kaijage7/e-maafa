package tz.go.pmo.dmis.common.sql;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class SafeIdentifiersTest {

    @Test
    void acceptsKnownPublicTable() {
        assertEquals("incidents", SafeIdentifiers.publicTable("incidents"));
        assertEquals("public.regions", SafeIdentifiers.publicQualified("regions"));
        assertEquals("district_id", SafeIdentifiers.userAreaColumn("district_id"));
    }

    @Test
    void rejectsInjectionAndUnknownTables() {
        assertThrows(ResponseStatusException.class, () -> SafeIdentifiers.publicTable("incidents; drop table users"));
        assertThrows(ResponseStatusException.class, () -> SafeIdentifiers.publicTable("not_a_real_table_xyz"));
        assertThrows(ResponseStatusException.class, () -> SafeIdentifiers.userAreaColumn("password"));
    }
}

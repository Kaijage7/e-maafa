package tz.go.pmo.dmis.inform.domain;

import jakarta.persistence.*;

/**
 * An administrative area (national / region / district / council), reconciled to official PMO council codes.
 * Values are keyed against {@code code}; councils additionally carry the official {@code councilCode} crosswalk.
 */
@Entity
@Table(schema = "public", name = "inform_area")
public class Area {
    @Id
    public String code;                  // INFORM area code (e.g. C001) or pcode
    public String name;
    public String level;                 // national | region | district | council
    @Column(name = "parent_code")
    public String parentCode;
    @Column(name = "council_code")
    public String councilCode;           // official PMO council_code (councils only)
    public String region;

    public Area() {}
}

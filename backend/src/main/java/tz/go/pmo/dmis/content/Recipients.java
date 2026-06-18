package tz.go.pmo.dmis.content;

import java.util.ArrayList;
import java.util.List;

/** Parse a compose-box recipients field: either a JSON list, or a comma/semicolon/newline-separated string. */
final class Recipients {

    private Recipients() {}

    static List<String> parse(Object raw) {
        List<String> out = new ArrayList<>();
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                if (o == null) continue;
                String s = String.valueOf(o).trim();
                if (!s.isBlank()) out.add(s);
            }
        } else if (raw != null) {
            for (String s : String.valueOf(raw).split("[,;\\n\\r]")) {
                String t = s.trim();
                if (!t.isBlank()) out.add(t);
            }
        }
        return out;
    }
}

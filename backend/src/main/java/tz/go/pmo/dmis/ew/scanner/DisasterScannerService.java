package tz.go.pmo.dmis.ew.scanner;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.xml.parsers.DocumentBuilderFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * Native OSINT disaster scanner — faithful port of the Python {@code disaster_scanner.py} sources + triage,
 * made REAL (persisted, deduped, dispatchable) instead of the inert in-session queue. Captures from
 * ReliefWeb (official), GDACS (official), USGS (earthquakes), and Google News (Swahili + English), classifies
 * the hazard type, resolves the Tanzania region, scores severity from casualties/affected, ranks source
 * reliability, and content-hash-dedupes so an authoritative copy is never lost to a social survivor.
 */
@Service
public class DisasterScannerService {

    private static final Logger log = LoggerFactory.getLogger(DisasterScannerService.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();
    private final JdbcTemplate jdbc;

    public DisasterScannerService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    // ── classification keywords (ported verbatim) ──
    private static final Map<String, List<String>> KEYWORDS = Map.ofEntries(
        Map.entry("flood", List.of("flood", "flooding", "mafuriko", "gharika", "maji kupanda", "river overflow", "inundated")),
        Map.entry("fire", List.of("fire", "wildfire", "blaze", "moto", "kuungua", "kuteketeza", "inferno")),
        Map.entry("drought", List.of("drought", "famine", "ukame", "uhaba wa maji", "water shortage", "crop failure")),
        Map.entry("earthquake", List.of("earthquake", "tremor", "seismic", "tetemeko", "magnitude", "quake")),
        Map.entry("landslide", List.of("landslide", "mudslide", "maporomoko", "rockslide", "debris flow")),
        Map.entry("cyclone", List.of("cyclone", "tropical storm", "kimbunga", "dhoruba", "hurricane")),
        Map.entry("disease", List.of("outbreak", "epidemic", "cholera", "dengue", "malaria", "mlipuko", "ugonjwa")),
        Map.entry("heavy_rain", List.of("heavy rain", "torrential", "mvua kubwa", "mvua kali", "downpour")),
        Map.entry("strong_wind", List.of("strong wind", "gale", "upepo mkali", "roof blown", "windstorm")),
        Map.entry("lightning", List.of("lightning", "thunderstorm", "radi", "umeme", "struck by lightning")));

    private static final List<String> TANZANIA_REGIONS = List.of(
        "Dar es Salaam", "Arusha", "Dodoma", "Geita", "Iringa", "Kagera", "Katavi", "Kigoma", "Kilimanjaro",
        "Lindi", "Manyara", "Mara", "Mbeya", "Morogoro", "Mtwara", "Mwanza", "Njombe", "Pwani", "Rukwa",
        "Ruvuma", "Shinyanga", "Simiyu", "Singida", "Songwe", "Tabora", "Tanga");

    private static final Map<String, String> PLACE_TO_REGION = Map.ofEntries(
        Map.entry("zanzibar", "Zanzibar"), Map.entry("songea", "Ruvuma"), Map.entry("bukoba", "Kagera"),
        Map.entry("musoma", "Mara"), Map.entry("moshi", "Kilimanjaro"), Map.entry("rufiji", "Pwani"),
        Map.entry("pangani", "Tanga"), Map.entry("bagamoyo", "Pwani"), Map.entry("sumbawanga", "Rukwa"));

    private static final Pattern CASUALTIES = Pattern.compile(
        "(\\d+)\\s*(?:dead|killed|died|kufariki|vifo|deaths|fatalities|waliokufa)", Pattern.CASE_INSENSITIVE);
    private static final Pattern AFFECTED = Pattern.compile(
        "(\\d+)\\s*(?:affected|displaced|evacuated|homeless|wakimbizi|walioathirika)", Pattern.CASE_INSENSITIVE);
    private static final Pattern DESTRUCTION = Pattern.compile(
        "destroyed|swept away|collapsed|emergency declared", Pattern.CASE_INSENSITIVE);

    // ── public scan entry point ──
    public Map<String, Object> scanAll(int days) {
        int total = 0, fresh = 0;
        List<List<Map<String, Object>>> batches = new ArrayList<>();
        batches.add(safe(() -> fetchUsgs(days)));            // structured: earthquakes near TZ
        batches.add(safe(() -> fetchGdacs()));               // global disaster alerts, TZ/E.Africa filtered
        batches.add(safe(() -> fetchReliefWebRss()));        // official humanitarian disaster declarations
        batches.add(safe(() -> fetchGdelt()));               // global keyword news monitor (best-effort)
        batches.add(fetchNewsFeeds());                       // keyword capture of REPORTED hazards (mafuriko/flood…)
        for (var batch : batches) {
            for (var raw : batch) { total++; if (persist(raw)) fresh++; }
        }
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("scanned", total);
        r.put("new", fresh);
        r.put("sources", List.of("usgs", "gdacs", "reliefweb", "gdelt", "dailynews", "allafrica", "bbcswahili", "bbcafrica"));
        return r;
    }

    /** Production auto-sweep — 60s after startup then hourly, so detections accrue without a manual trigger. */
    @org.springframework.scheduling.annotation.Scheduled(initialDelayString = "${dmis.scanner.initial-delay-ms:60000}",
                                                         fixedDelayString = "${dmis.scanner.interval-ms:3600000}")
    public void scheduledSweep() {
        try {
            Map<String, Object> r = scanAll(7);
            log.info("scheduled disaster scan: {} checked, {} new", r.get("scanned"), r.get("new"));
        } catch (Exception e) {
            log.warn("scheduled disaster scan failed: {}", e.getMessage());
        }
    }

    // ── source fetchers ──
    private List<Map<String, Object>> fetchUsgs(int days) throws Exception {
        var end = java.time.LocalDate.now();
        var start = end.minusDays(Math.max(1, days));
        String url = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson"
            + "&starttime=" + start + "&endtime=" + end
            + "&minlatitude=-15.0&maxlatitude=5.0&minlongitude=25.0&maxlongitude=45.0"
            + "&minmagnitude=2.5&orderby=time&limit=60";
        JsonNode root = JSON.readTree(httpGet(url));
        List<Map<String, Object>> out = new ArrayList<>();
        for (JsonNode f : root.path("features")) {
            JsonNode p = f.path("properties");
            double mag = p.path("mag").asDouble(0);
            String place = p.path("place").asText("");
            JsonNode coords = f.path("geometry").path("coordinates");
            Map<String, Object> m = base("usgs", "USGS",
                "M" + mag + " Earthquake - " + place,
                "Magnitude " + mag + " earthquake at " + place + ".",
                p.path("url").asText(""), iso(p.path("time").asLong(0)));
            m.put("external_id", f.path("id").asText());
            m.put("hazard_type", "earthquake");
            m.put("severity", mag >= 5.5 ? "critical" : mag >= 4.5 ? "high" : mag >= 3.5 ? "medium" : "low");
            if (coords.isArray() && coords.size() >= 2) { m.put("longitude", coords.get(0).asDouble()); m.put("latitude", coords.get(1).asDouble()); }
            out.add(m);
        }
        return out;
    }

    // ReliefWeb's public API needs a registered appname (v1 decommissioned); the disasters RSS is open.
    private List<Map<String, Object>> fetchReliefWebRss() throws Exception {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, String> e : parseRss("https://reliefweb.int/disasters/rss.xml", 25)) {
            String text = (e.get("title") + " " + e.get("summary")).toLowerCase();
            if (!text.contains("tanzania") && !text.contains("east africa")) continue;
            out.add(base("reliefweb", "ReliefWeb", e.get("title"), trunc(e.get("summary"), 500), e.get("link"), e.get("date")));
        }
        return out;
    }

    /** GDELT global news monitor — keyword capture of TZ-published disaster reports (best-effort; throttled 1/5s). */
    private List<Map<String, Object>> fetchGdelt() throws Exception {
        String q = enc("(flood OR mafuriko OR earthquake OR tetemeko OR fire OR drought OR cholera OR landslide OR cyclone OR storm) sourcecountry:TZ");
        String url = "https://api.gdeltproject.org/api/v2/doc/doc?query=" + q + "&mode=artlist&format=json&maxrecords=40&timespan=21d";
        String resp = httpGet(url);
        if (resp == null || !resp.trim().startsWith("{")) return List.of();   // rate-limit notice → skip gracefully
        JsonNode root = JSON.readTree(resp);
        List<Map<String, Object>> out = new ArrayList<>();
        for (JsonNode a : root.path("articles")) {
            out.add(base("gdelt", "GDELT", a.path("title").asText(""), a.path("domain").asText(""),
                a.path("url").asText(""), a.path("seendate").asText("")));
        }
        return out;
    }

    /** Authentic Tanzania/Swahili news feeds, keyword-classified — captures what is REPORTED online (floods etc). */
    private record NewsFeed(String id, String name, String url, boolean tzScoped) {}
    private static final List<NewsFeed> NEWS_FEEDS = List.of(
        new NewsFeed("dailynews", "Daily News TZ", "https://dailynews.co.tz/feed/", true),
        new NewsFeed("allafrica_tz", "allAfrica Tanzania", "https://allafrica.com/tools/headlines/rdf/tanzania/headlines.rdf", true),
        new NewsFeed("allafrica_disaster", "allAfrica Disasters", "https://allafrica.com/tools/headlines/rdf/disaster/headlines.rdf", false),
        new NewsFeed("allafrica_floods", "allAfrica Floods", "https://allafrica.com/tools/headlines/rdf/flooding/headlines.rdf", false),
        new NewsFeed("bbcswahili", "BBC Swahili", "https://feeds.bbci.co.uk/swahili/rss.xml", false),
        new NewsFeed("bbcafrica", "BBC Africa", "https://feeds.bbci.co.uk/news/world/africa/rss.xml", false));

    // East/Southern Africa relevance — a Tanzania national monitor also tracks regional spillover events.
    private static final List<String> AFRICA_TERMS = List.of("tanzania", "kenya", "uganda", "rwanda", "burundi",
        "congo", "drc", "mozambique", "malawi", "zambia", "ethiopia", "somalia", "south sudan", "sudan",
        "zimbabwe", "madagascar", "comoros", "east africa", "africa");
    private static boolean mentionsAfrica(String text) {
        String t = text.toLowerCase();
        for (String k : AFRICA_TERMS) if (t.contains(k)) return true;
        return false;
    }

    private List<Map<String, Object>> fetchNewsFeeds() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (NewsFeed f : NEWS_FEEDS) {
            try {
                for (Map<String, String> e : parseRss(f.url(), 50)) {
                    String title = e.get("title"), summary = e.get("summary");
                    String text = title + " " + (summary == null ? "" : summary);
                    String hazard = classify(text);
                    if (hazard.equals("other")) continue;                                  // keyword filter: only reported hazards
                    if (!f.tzScoped() && extractRegion(text) == null && !mentionsAfrica(text)) continue;  // broad feed → regional relevance
                    Map<String, Object> m = base(f.id(), f.name(), title, trunc(summary, 400), e.get("link"), e.get("date"));
                    m.put("hazard_type", hazard);
                    out.add(m);
                }
            } catch (Exception ex) { log.warn("news feed {} failed: {}", f.id(), ex.getMessage()); }
        }
        return out;
    }

    private List<Map<String, Object>> fetchGdacs() throws Exception {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, String> e : parseRss("https://www.gdacs.org/xml/rss.xml", 60)) {
            String text = e.get("title") + " " + e.get("summary");
            if (!mentionsAfrica(text)) continue;   // capture Africa-region disaster alerts (regional awareness)
            out.add(base("gdacs", "GDACS", e.get("title"), trunc(e.get("summary"), 500), e.get("link"), e.get("date")));
        }
        return out;
    }

    // ── persistence with classification + content-hash dedup (fixes register #38/#39/#54) ──
    private boolean persist(Map<String, Object> r) {
        String title = str(r.get("title"));
        if (title == null || title.isBlank()) return false;
        String body = str(r.get("body"));
        String sourceId = str(r.get("source_id"));
        String text = (title + " " + (body == null ? "" : body));

        String hazard = r.containsKey("hazard_type") ? str(r.get("hazard_type")) : classify(text);
        String region = extractRegion(text);
        String severity = r.containsKey("severity") ? str(r.get("severity")) : scoreSeverity(text);
        String reliability = switch (sourceId) { case "reliefweb", "gdacs", "usgs" -> "official"; case "gnews" -> "news"; default -> "social"; };
        String dedupKey = sourceId + ":" + md5(normalize(title));

        try {
            String raw = JSON.writeValueAsString(r);
            Integer n = jdbc.update(
                "insert into public.scanner_detections(source_id, external_id, dedup_key, title, summary, url, "
                    + "hazard_type, severity, reliability, region, latitude, longitude, published_at, raw) "
                    + "values (?,?,?,?,?,?,?,?,?,?,?,?,?,?::json) on conflict (dedup_key) do nothing",
                sourceId, str(r.get("external_id")), dedupKey, title, body, str(r.get("url")),
                hazard, severity, reliability, region, r.get("latitude"), r.get("longitude"),
                parseInstant(str(r.get("date"))), raw);
            return n != null && n > 0;
        } catch (Exception e) {
            log.warn("scanner persist failed: {}", e.getMessage());
            return false;
        }
    }

    // ── triage helpers (ported) ──
    private static String classify(String text) {
        String t = text.toLowerCase();
        String best = "other"; int bestScore = 0;
        for (var en : KEYWORDS.entrySet()) {
            int score = 0;
            for (String kw : en.getValue()) if (t.contains(kw)) score++;
            if (score > bestScore) { bestScore = score; best = en.getKey(); }
        }
        return bestScore > 0 ? best : "other";
    }

    private static String extractRegion(String text) {
        String t = text.toLowerCase();
        for (String region : TANZANIA_REGIONS) if (t.contains(region.toLowerCase())) return region;
        for (var en : PLACE_TO_REGION.entrySet()) if (t.contains(en.getKey())) return en.getValue();
        return t.contains("tanzania") ? "Tanzania" : null;
    }

    private static String scoreSeverity(String text) {
        Matcher c = CASUALTIES.matcher(text);
        if (c.find()) { int n = Integer.parseInt(c.group(1)); return n >= 10 ? "critical" : n >= 3 ? "high" : "medium"; }
        Matcher a = AFFECTED.matcher(text);
        if (a.find()) { int n = Integer.parseInt(a.group(1)); return n >= 1000 ? "critical" : n >= 100 ? "high" : "medium"; }
        return DESTRUCTION.matcher(text).find() ? "high" : "low";
    }

    // ── infra ──
    private String httpGet(String url) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
            .header("User-Agent", "tz-ew-scanner/1.0").timeout(Duration.ofSeconds(15)).GET().build();
        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() >= 300) throw new RuntimeException("HTTP " + resp.statusCode() + " from " + url);
        return resp.body();
    }

    private List<Map<String, String>> parseRss(String url, int limit) throws Exception {
        String xml = httpGet(url);
        var dbf = DocumentBuilderFactory.newInstance();
        dbf.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
        var doc = dbf.newDocumentBuilder().parse(new java.io.ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
        NodeList items = doc.getElementsByTagName("item");
        List<Map<String, String>> out = new ArrayList<>();
        for (int i = 0; i < items.getLength() && i < limit; i++) {
            Element it = (Element) items.item(i);
            out.add(Map.of("title", tag(it, "title"), "summary", tag(it, "description"),
                "link", tag(it, "link"), "date", tag(it, "pubDate")));
        }
        return out;
    }

    private static String tag(Element e, String name) {
        NodeList n = e.getElementsByTagName(name);
        return n.getLength() > 0 ? n.item(0).getTextContent().trim() : "";
    }

    private static Map<String, Object> base(String sourceId, String source, String title, String body, String url, String date) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("source_id", sourceId); m.put("source", source); m.put("title", title);
        m.put("body", body); m.put("url", url); m.put("date", date);
        return m;
    }

    private interface Fetch { List<Map<String, Object>> get() throws Exception; }
    private List<Map<String, Object>> safe(Fetch f) {
        try { return f.get(); } catch (Exception e) { log.warn("scanner source failed: {}", e.getMessage()); return List.of(); }
    }

    private static String enc(String s) { return URLEncoder.encode(s, StandardCharsets.UTF_8); }
    private static String trunc(String s, int n) { return s == null ? null : (s.length() > n ? s.substring(0, n) : s); }
    private static String shortDate(String s) { return s == null || s.length() < 10 ? null : s.substring(0, 10); }
    private static String str(Object o) { return o == null ? null : String.valueOf(o); }
    private static String emptyToNull(String s) { return s == null || s.isBlank() ? null : s; }
    private static String normalize(String s) { return s.toLowerCase().replaceAll("[^a-z0-9]+", " ").trim(); }
    private static String iso(long epochMs) { return epochMs <= 0 ? null : java.time.Instant.ofEpochMilli(epochMs).toString(); }

    /** Parse a published date from any source — ISO instant (USGS), RFC-1123 (RSS pubDate), or yyyy-MM-dd. */
    private static java.sql.Timestamp parseInstant(String s) {
        if (s == null || s.isBlank()) return null;
        try { return java.sql.Timestamp.from(java.time.Instant.parse(s)); } catch (Exception ignored) { }
        try { return java.sql.Timestamp.from(java.time.ZonedDateTime.parse(s, java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME).toInstant()); } catch (Exception ignored) { }
        try { return java.sql.Timestamp.from(java.time.LocalDateTime.parse(s, java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'")).toInstant(java.time.ZoneOffset.UTC)); } catch (Exception ignored) { }
        try { return java.sql.Timestamp.from(java.time.LocalDate.parse(s.substring(0, Math.min(10, s.length()))).atStartOfDay(java.time.ZoneOffset.UTC).toInstant()); } catch (Exception ignored) { }
        return null;
    }
    private static String md5(String s) {
        try {
            byte[] d = MessageDigest.getInstance("MD5").digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 8; i++) sb.append(String.format("%02x", d[i]));
            return sb.toString();
        } catch (Exception e) { return Integer.toHexString(s.hashCode()); }
    }
}

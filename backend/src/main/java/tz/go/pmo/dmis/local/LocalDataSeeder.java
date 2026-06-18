package tz.go.pmo.dmis.local;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Seeds the EXISTING EW tables on first start of the {@code local} profile, mirroring the data the
 * existing EW application would hold, so the read endpoint has something to return. Local profile only.
 */
@Component
@Profile("local")
@RequiredArgsConstructor
public class LocalDataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(LocalDataSeeder.class);

    private final JdbcTemplate jdbc;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    @Override
    public void run(String... args) {
        seedUsers();
        seedWarnings();
        seedEvacuationCenters();
        seedWarehouses();
        seedInventory();
        seedTemporaryWarehouses();
        seedTrainingPlans();
        seedAlertSubscriptions();
    }

    private void seedUsers() {
        Long count = jdbc.queryForObject("select count(*) from public.users", Long.class);
        if (count != null && count > 0) {
            log.info("local seed: users present, skipping");
            return;
        }
        String[] roles = {"Super Admin", "Secretary", "Director", "Asst. Director", "EOCC", "Comms Officer",
                "ICT Admin", "MDA Focal", "RAS", "Reg DC", "DAS", "Dist DC", "Partners"};
        for (int i = 0; i < roles.length; i++) {
            jdbc.update("insert into public.roles(id,name,guard_name,created_at,updated_at) values (?,?,'web',now(),now())",
                    i + 1, roles[i]);
        }
        user(1, "System Administrator", "admin@example.com", "admin", "Super Admin");
        user(2, "EOCC Officer", "eocc@pmo.go.tz", "eocc", "EOCC");
        user(3, "PMO Director", "director@pmo.go.tz", "director", "Director");
        user(4, "District Coordinator", "dc@test.com", "dc", "Dist DC");
        user(5, "TMA Focal", "tma@meteo.go.tz", "mda", "MDA Focal");
        log.info("local seed: done (5 users, 13 roles)");
    }

    private void user(long id, String name, String email, String password, String role) {
        jdbc.update("insert into public.users(id,name,email,password,email_verified_at,created_at,updated_at) "
                + "values (?,?,?,?,now(),now(),now())", id, name, email, encoder.encode(password));
        Long roleId = jdbc.queryForObject("select id from public.roles where name = ?", Long.class, role);
        jdbc.update("insert into public.model_has_roles(role_id,model_type,model_id) values (?, 'App\\Models\\User', ?)",
                roleId, id);
    }

    private void seedWarnings() {
        Long count = jdbc.queryForObject("select count(*) from public.warnings", Long.class);
        if (count != null && count > 0) {
            log.info("local seed: existing EW data present, skipping");
            return;
        }
        log.info("local seed: creating sample EW data ...");

        jdbc.update("INSERT INTO public.hazards(id,name,type,created_at,updated_at) VALUES "
                + "(1,'Floods','Hydrological',now(),now()),(2,'Heavy rain','Meteorological',now(),now()),"
                + "(3,'Strong wind','Meteorological',now(),now()),(4,'Drought','Climatological',now(),now()),"
                + "(5,'Landslide','Geological',now(),now())");

        jdbc.update("INSERT INTO public.regions(id,name,code,region_code,created_at,updated_at) VALUES "
                + "(7,'Dar es Salaam','07','07',now(),now()),(18,'Kagera','18','18',now(),now()),"
                + "(8,'Lindi','08','08',now(),now()),(1,'Dodoma','01','01',now(),now()),"
                + "(3,'Kilimanjaro','03','03',now(),now())");

        jdbc.update("INSERT INTO public.districts(id,region_id,name,code,district_code,created_at,updated_at) VALUES "
                + "(701,7,'Kinondoni','0701','0701',now(),now()),(1801,18,'Bukoba','1801','1801',now(),now()),"
                + "(801,8,'Lindi Urban','0801','0801',now(),now()),(101,1,'Dodoma Urban','0101','0101',now(),now()),"
                + "(301,3,'Moshi','0301','0301',now(),now())");

        jdbc.update("INSERT INTO public.warnings(id,warning_code,status,is_approved,approved_at,created_at,updated_at) VALUES "
                + "(1,'EW-2026-00042','published',true,now(),now()- interval '4 days',now()),"
                + "(2,'EW-2026-00041','published',true,now(),now()- interval '3 days',now()),"
                + "(3,'EW-2026-00039','published',true,now(),now()- interval '2 days',now()),"
                + "(4,'EW-2026-00040','approved',true,now(),now()- interval '1 day',now()),"
                + "(5,'EW-2026-00038','pending',false,null,now(),now())");

        seedHazard(1, 1, 1, "High", "Major Warning", 7, 701, "Severe coastal flooding forecast for Dar es Salaam within 24-72 hours.");
        seedHazard(2, 2, 2, "Medium", "Warning", 18, 1801, "Heavy rain over north-western regions; localized floods possible.");
        seedHazard(3, 3, 3, "Low", "Advisory", 8, 801, "Strong winds up to 40 km/h along the southern coast.");
        seedHazard(4, 4, 5, "High", "Major Warning", 3, 301, "Landslide risk on the Kilimanjaro slopes after sustained rainfall.");
        seedHazard(5, 5, 4, "Low", "Advisory", 1, 101, "Below-average rainfall outlook for the central regions.");

        log.info("local seed: done (5 warnings)");
    }

    private void seedHazard(long id, long warningId, long hazardId, String likelihood, String level,
                            long regionId, long districtId, String description) {
        jdbc.update("INSERT INTO public.warning_hazards(id,warning_id,hazard_id,likelihood_of_occurrence,"
                + "warning_level,validity_start,validity_end,technical_description,region_id,district_id,"
                + "created_at,updated_at) VALUES (?,?,?,?,?,now(),now()+interval '3 days',?,?,?,now(),now())",
                id, warningId, hazardId, likelihood, level, description, regionId, districtId);
    }

    private void seedEvacuationCenters() {
        Long count = jdbc.queryForObject("select count(*) from public.evacuation_centers", Long.class);
        if (count != null && count > 0) {
            log.info("local seed: evacuation centers present, skipping");
            return;
        }
        center("EC-DSM-001", "Mnazi Mmoja Hall", "[\"Public hall\"]", "Dar es Salaam", "Kinondoni", 1200, "Active", "Wheelchair accessible", -6.81, 39.28);
        center("EC-KAG-001", "Bukoba Stadium", "[\"Stadium\",\"Open ground\"]", "Kagera", "Bukoba", 3000, "Active", "Vehicle accessible", -1.33, 31.81);
        center("EC-LND-001", "Lindi Secondary School", "[\"School\"]", "Lindi", "Lindi Urban", 800, "Active", "Limited access", -10.00, 39.71);
        center("EC-DOM-001", "Dodoma Community Center", "[\"Community center\"]", "Dodoma", "Dodoma Urban", 600, "Under renovation", "Wheelchair accessible", -6.17, 35.74);
        center("EC-KIL-001", "Moshi Church Hall", "[\"Church hall\"]", "Kilimanjaro", "Moshi", 450, "Active", "Vehicle accessible", -3.35, 37.34);
        log.info("local seed: done (5 evacuation centers)");
    }

    private void center(String ecentreId, String name, String typeJson, String region, String district,
                        int capacity, String status, String accessibility, double lat, double lng) {
        jdbc.update("INSERT INTO public.evacuation_centers(ecentre_id,centre_name,centre_type,region,district,"
                + "capacity_people,accessibility,status,latitude,longitude,created_at,updated_at) "
                + "VALUES (?,?,?,?,?,?,?,?,?,?,now(),now())",
                ecentreId, name, typeJson, region, district, capacity, accessibility, status, lat, lng);
    }

    private void seedWarehouses() {
        Long count = jdbc.queryForObject("select count(*) from public.warehouses", Long.class);
        if (count != null && count > 0) {
            log.info("local seed: warehouses present, skipping");
            return;
        }
        warehouse("PMO Central Warehouse", "Central Zone", "Dodoma", "Nala Industrial Area, Dodoma", 5000, "Operational", "Juma Athumani", "0713100001", -6.17, 35.74);
        warehouse("Coastal Relief Hub", "Coastal Zone", "Dar es Salaam", "Vingunguti, Ilala", 8000, "Operational", "Asha Mpemba", "0713100002", -6.81, 39.28);
        warehouse("Lake Zone Depot", "Lake Zone", "Mwanza", "Nyakato, Ilemela", 4500, "Under renovation", "Peter Magesa", "0713100003", -2.52, 32.90);
        warehouse("Northern Warehouse", "Northern Zone", "Arusha", "Unga Ltd Road, Arusha", 6000, "Operational", "Neema Laizer", "0713100004", -3.37, 36.69);
        warehouse("Southern Highlands Store", "Southern Highlands Zone", "Mbeya", "Iyunga, Mbeya", 3500, "Standby", "Frank Mwakyusa", "0713100005", -8.91, 33.46);
        warehouse("Western Depot", "Western Zone", "Kigoma", "Mwanga, Kigoma", 3000, "Operational", "Salma Ramadhani", "0713100006", -4.88, 29.63);
        log.info("local seed: done (6 warehouses)");
    }

    private void warehouse(String name, String zone, String cityOrRegion, String address, int capacitySqm,
                           String status, String contactName, String contactPhone, double lat, double lng) {
        jdbc.update("INSERT INTO public.warehouses(name,zone,location_address,city_or_region,storage_capacity_sqm,"
                + "operational_status,contact_person_name,contact_person_phone,latitude,longitude,created_at,updated_at) "
                + "VALUES (?,?,?,?,?,?,?,?,?,?,now(),now())",
                name, zone, address, cityOrRegion, capacitySqm, status, contactName, contactPhone, lat, lng);
    }

    private void seedInventory() {
        Long count = jdbc.queryForObject("select count(*) from public.inventory_items", Long.class);
        if (count != null && count > 0) {
            log.info("local seed: inventory present, skipping");
            return;
        }
        jdbc.update("INSERT INTO public.resources(id,name,category,created_at,updated_at) VALUES "
                + "(1,'Tarpaulins','Emergency Shelter',now(),now()),(2,'Blankets','Non-Food Items',now(),now()),"
                + "(3,'Rice','Food Items',now(),now()),(4,'Water Purification Tablets','Non-Food Items',now(),now()),"
                + "(5,'First Aid Kits','Search and Rescue Equipment',now(),now()),(6,'Tents','Emergency Shelter',now(),now())");
        item(1, 1, "Heavy-duty Tarpaulin 4x6m", "Emergency Shelter", 1200, "TARP-2026-01", "2028-12-31", "Good Condition", 200);
        item(2, 2, "Wool Blanket", "Non-Food Items", 80, "BLK-2026-02", null, "Good Condition", 150);
        item(3, 1, "Rice 25kg bag", "Food Items", 5000, "RICE-2026-03", "2026-07-15", "Good Condition", 1000);
        item(4, 3, "Aquatabs 67mg", "Non-Food Items", 0, "WTR-2026-04", "2026-06-30", "Good Condition", 500);
        item(5, 4, "First Aid Kit", "Search and Rescue Equipment", 300, "FAK-2026-05", "2025-12-01", "Damaged", 50);
        item(6, 5, "Family Tent 12-person", "Emergency Shelter", 450, "TENT-2026-06", null, "Good Condition", 100);
        item(3, 6, "Rice 25kg bag", "Food Items", 2500, "RICE-2026-07", "2027-03-20", "Good Condition", 1000);
        item(2, 4, "Fleece Blanket", "Non-Food Items", 600, "BLK-2026-08", null, "Good Condition", 150);
        log.info("local seed: done (8 inventory items)");
    }

    private void item(long resourceId, long warehouseId, String name, String category, int qty, String batch,
                      String expiry, String status, int minThreshold) {
        jdbc.update("INSERT INTO public.inventory_items(resource_id,warehouse_id,item_name,category,quantity,"
                + "batch_number,expiry_date,status,minimum_threshold,warehouse_type,created_at,updated_at) "
                + "VALUES (?,?,?,?,?,?,?::date,?,?,'zonal',now(),now())",
                resourceId, warehouseId, name, category, qty, batch, expiry, status, minThreshold);
    }

    private void seedTemporaryWarehouses() {
        Long count = jdbc.queryForObject("select count(*) from public.temporary_warehouses", Long.class);
        if (count != null && count > 0) {
            log.info("local seed: temporary warehouses present, skipping");
            return;
        }
        tempWh("Ilala District Emergency Store", "TW-DSM-001", "district", "Vingunguti ward, Ilala MC", "Active", "Asha Mpemba", "0714200001", -6.81, 39.28);
        tempWh("Mwanza Regional Temp Depot", "TW-MZ-002", "regional", "Nyakato, Ilemela", "Active", "Peter Magesa", "0714200002", -2.52, 32.90);
        tempWh("Dodoma National Reserve Annex", "TW-DOM-003", "national", "Nala Industrial Area, Dodoma", "Active", "Juma Athumani", "0714200003", -6.17, 35.74);
        tempWh("Arusha District Store", "TW-ARU-004", "district", "Unga Ltd Road, Arusha", "Inactive", "Neema Laizer", "0714200004", -3.37, 36.69);
        tempWh("Mbeya Regional Temp Hub", "TW-MBY-005", "regional", "Iyunga, Mbeya CBD", "Active", "Frank Mwakyusa", "0714200005", -8.91, 33.46);
        log.info("local seed: done (5 temporary warehouses)");
    }

    private void tempWh(String name, String code, String level, String location, String status,
                        String contactName, String contactPhone, double lat, double lng) {
        jdbc.update("INSERT INTO public.temporary_warehouses(name,code,level,location_description,operational_status,"
                + "is_active,contact_person_name,contact_person_phone,latitude,longitude,established_date,created_at,updated_at) "
                + "VALUES (?,?,?,?,?,?,?,?,?,?,now(),now(),now())",
                name, code, level, location, status, "Active".equals(status), contactName, contactPhone, lat, lng);
    }

    private void seedTrainingPlans() {
        Long count = jdbc.queryForObject("select count(*) from public.training_plans", Long.class);
        if (count != null && count > 0) {
            log.info("local seed: training plans present, skipping");
            return;
        }
        training("TRN-2026-001", "Community Flood Response Training", "PMO-DMD", "[\"Dar es Salaam\",\"Pwani\"]", "[\"Community\",\"Volunteers\"]", "Ilala Community Hall", "2026-02-10", "2026-02-14", "Government", "completed");
        training("TRN-2026-002", "Early Warning Dissemination Workshop", "Tanzania Meteorological Authority", "[\"Mwanza\",\"Mara\"]", "[\"LGAs\",\"Staff\"]", "Mwanza Regional Office", "2026-05-05", "2026-05-08", "Government", "ongoing");
        training("TRN-2026-003", "Disaster Risk Assessment Training", "NEMC", "[\"Dodoma\"]", "[\"Staff\"]", "Dodoma HQ", "2026-07-01", "2026-07-05", "Non-Government Agencies", "planned");
        training("TRN-2026-004", "Search and Rescue Drill", "Fire and Rescue Force", "[\"Arusha\",\"Kilimanjaro\"]", "[\"Volunteers\",\"Community\"]", "Arusha Grounds", "2026-08-12", "2026-08-15", "Government", "planned");
        log.info("local seed: done (4 training plans)");
    }

    private void training(String id, String title, String institution, String scope, String audience,
                          String venue, String start, String end, String fund, String status) {
        jdbc.update("INSERT INTO public.training_plans(training_id,training_title,implementing_institution,"
                + "geographical_scope,targeted_audience,venue,training_start_date,training_end_date,source_of_fund,"
                + "status,created_at,updated_at) VALUES (?,?,?,?::jsonb,?::jsonb,?,?::date,?::date,?,?,now(),now())",
                id, title, institution, scope, audience, venue, start, end, fund, status);
    }

    private void seedAlertSubscriptions() {
        Long count = jdbc.queryForObject("select count(*) from public.alert_subscriptions", Long.class);
        if (count != null && count > 0) {
            log.info("local seed: alert subscriptions present, skipping");
            return;
        }
        subscriber("SUB-2026-0001", "Hassan Mwinyi", "Dar es Salaam", "[\"SMS\",\"Email\"]", "0715300001", "hassan@example.com", "[\"Floods\",\"Heavy Rainfall\"]", "All Levels", true);
        subscriber("SUB-2026-0002", "Grace Mushi", "Arusha", "[\"SMS\"]", "0715300002", null, "[\"Strong Winds\"]", "Warning", true);
        subscriber("SUB-2026-0003", "John Kessy", "Mwanza", "[\"Email\",\"WhatsApp\"]", null, "john.k@example.com", "[\"Floods\"]", "Major Warning", true);
        subscriber("SUB-2026-0004", "Amina Juma", "Mbeya", "[\"SMS\",\"Email\"]", "0715300004", "amina@example.com", "[\"Drought\",\"Floods\"]", "All Levels", true);
        subscriber("SUB-2026-0005", "Peter Mlay", "Dodoma", "[\"SMS\"]", "0715300005", null, "[\"Heavy Rainfall\"]", "Advisory", false);
        log.info("local seed: done (5 alert subscriptions)");
    }

    private void subscriber(String id, String name, String location, String channels, String phone,
                            String email, String hazards, String priority, boolean active) {
        jdbc.update("INSERT INTO public.alert_subscriptions(subscription_id,full_name,subscriber_location,"
                + "communication_channels,phone_number,email,hazards_of_interest,alert_level_priority,languages,"
                + "consent,is_active,subscribed_at,created_at,updated_at) "
                + "VALUES (?,?,?,?::jsonb,?,?,?::jsonb,?,?::jsonb,true,?,now(),now(),now())",
                id, name, location, channels, phone, email, hazards, priority, "[\"English\",\"Swahili\"]", active);
    }
}

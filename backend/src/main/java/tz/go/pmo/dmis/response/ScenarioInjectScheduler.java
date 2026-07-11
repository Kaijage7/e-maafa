package tz.go.pmo.dmis.response;

import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;

/**
 * F79: fire due scenario injects even when nobody has the Command Post board open.
 * Board GET still fires due injects for the open activation (immediate UX); this covers
 * the gap when the exercise director walks away.
 * <p>Default {@code dmis.scenario-injects.enabled=false} so country prod does not run
 * exercise inject polling unless ops explicitly enable it for a drill window.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ScenarioInjectScheduler {

    private final JdbcTemplate jdbc;
    private final ActivationService activations;
    private final CurrentUserResolver users;

    @Value("${dmis.scenario-injects.enabled:false}")
    private boolean enabled;

    @Scheduled(fixedDelayString = "${dmis.scenario-injects.poll-ms:60000}")
    @Transactional
    public void fireDueInjects() {
        if (!enabled) {
            return;
        }
        List<Map<String, Object>> due = jdbc.queryForList("""
                select ai.id, ai.activation_id, ai.title
                from public.activation_injects ai
                join public.response_activations a on a.id = ai.activation_id
                where ai.status = 'pending'
                  and ai.due_at is not null
                  and ai.due_at <= now()
                  and lower(coalesce(a.status,'')) = 'active'
                order by ai.due_at, ai.id
                limit 50
                """);
        if (due.isEmpty()) {
            return;
        }
        // task_activity_log.user_id is NOT NULL — real Super Admin / configured system actor only.
        Long systemUserId = users.systemActorUserId();
        int fired = 0;
        for (Map<String, Object> row : due) {
            long injectId = ((Number) row.get("id")).longValue();
            long activationId = ((Number) row.get("activation_id")).longValue();
            int n = jdbc.update("""
                    update public.activation_injects
                       set status = 'fired', fired_at = now(), updated_at = now()
                     where id = ? and status = 'pending'
                    """, injectId);
            if (n == 0) {
                continue;
            }
            fired++;
            if (systemUserId != null) {
                try {
                    activations.log(activationId, systemUserId, "inject_fired",
                            "INJECT (scheduled): " + row.get("title"), null);
                } catch (RuntimeException ex) {
                    // Journal is best-effort — fire status already committed on this row if outer TX allows.
                    log.warn("inject journal skip for activation {}: {}", activationId, ex.getMessage());
                }
            }
        }
        if (fired > 0) {
            log.info("Scenario inject scheduler fired {} due inject(s)", fired);
        }
    }

}

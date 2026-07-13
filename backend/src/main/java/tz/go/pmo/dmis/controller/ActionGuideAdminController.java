package tz.go.pmo.dmis.controller;

import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.ew.ActionGuideStatementService;

/**
 * Content Management → Action Guide Book. Lets PMO edit the official impact statement library
 * (hazard × colour rows EN/SW) used by PMO-DMD statement proposals. Does not auto-disseminate.
 */
@RestController
@RequestMapping("/v1/content/action-guide")
public class ActionGuideAdminController {

    private final ActionGuideStatementService guide;
    private final CurrentUserResolver users;

    public ActionGuideAdminController(ActionGuideStatementService guide, CurrentUserResolver users) {
        this.guide = guide;
        this.users = users;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('content_management.view') or hasAuthority('early_warning.view')")
    public Map<String, Object> list(@RequestParam(required = false) String hazardId,
                                    @RequestParam(required = false) String level) {
        return guide.adminList(hazardId, level);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('content_management.manage')")
    public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return guide.adminUpdate(id, body, users.actingUserId());
    }

    @PutMapping("/common")
    @PreAuthorize("hasAuthority('content_management.manage')")
    public Map<String, Object> updateCommon(@RequestBody Map<String, Object> body) {
        return guide.adminUpdateCommon(body, users.actingUserId());
    }

    @PostMapping("/seed")
    @PreAuthorize("hasAuthority('content_management.manage')")
    public Map<String, Object> seed(@RequestBody(required = false) Map<String, Object> body) {
        boolean force = body != null && Boolean.parseBoolean(String.valueOf(body.getOrDefault("force", false)));
        return guide.seedFromCatalog(force);
    }
}

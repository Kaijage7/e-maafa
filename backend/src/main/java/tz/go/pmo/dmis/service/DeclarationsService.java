package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Formal disaster declarations under DM Act 2022 ss.32–33
 * (propose → technical review → steering endorse → declare / extend / revoke).
 * Paths and JSON unchanged from the former response package controller.
 */
public interface DeclarationsService {

    Map<String, Object> index();

    Map<String, Object> show(long id);

    Map<String, Object> propose(Map<String, Object> body);

    Map<String, Object> technicalReview(long id, Map<String, Object> body);

    Map<String, Object> endorse(long id, Map<String, Object> body);

    Map<String, Object> declare(long id, Map<String, Object> body);

    Map<String, Object> extend(long id, Map<String, Object> body);

    Map<String, Object> revoke(long id, Map<String, Object> body);

    Map<String, Object> committees();
}

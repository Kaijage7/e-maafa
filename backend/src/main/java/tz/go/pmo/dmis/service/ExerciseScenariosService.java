package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Reusable Command Post exercise scenarios (index, show, create, launch).
 * Paths and JSON unchanged from the former response package controller.
 */
public interface ExerciseScenariosService {

    Map<String, Object> index();

    Map<String, Object> show(long id);

    Map<String, Object> create(Map<String, Object> body) throws Exception;

    Map<String, Object> launch(long id, Map<String, Object> body);
}

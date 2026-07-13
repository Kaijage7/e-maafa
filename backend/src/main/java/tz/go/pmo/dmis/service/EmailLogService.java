package tz.go.pmo.dmis.service;

import java.util.Map;

/** Email delivery log + compose. Paths/JSON unchanged. */
public interface EmailLogService {

    Map<String, Object> index(String status, String search, String from, String to);

    Map<String, Object> send(Map<String, Object> body);
}

package tz.go.pmo.dmis.service;

import java.util.Map;

/** SMS delivery log + compose. Paths/JSON unchanged. */
public interface SmsLogService {

    Map<String, Object> index(String status, String search, String from, String to);

    Map<String, Object> send(Map<String, Object> body);
}

package tz.go.pmo.dmis.service;

import java.util.Map;

/** Admin channel diagnostics (SMS / email test send). Paths/JSON unchanged. */
public interface ChannelTestService {

    Map<String, Object> testSms(Map<String, Object> body);

    Map<String, Object> testEmail(Map<String, Object> body);
}

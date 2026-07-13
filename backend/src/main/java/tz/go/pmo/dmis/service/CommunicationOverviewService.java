package tz.go.pmo.dmis.service;

import java.util.Map;

/** Communication Center overview + audience pickers. Paths/JSON unchanged. */
public interface CommunicationOverviewService {

    Map<String, Object> audiences();

    Map<String, Object> overview(String range);
}

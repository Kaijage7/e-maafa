package tz.go.pmo.dmis.service;

import java.util.Map;

/** Bilingual EN/SW UI string registry (System Settings → Translations). */
public interface TranslationService {

    Map<String, Object> index(String group, String search);

    Map<String, Object> create(Map<String, Object> request);

    Map<String, Object> update(long id, Map<String, Object> request);

    void delete(long id);
}

package tz.go.pmo.dmis.service;

import java.util.Map;

/** eGA service — paths unchanged (/v1/finance). Includes maker-checker commitments + NDMF. */
public interface BudgetService {

    Map<String, Object> periods();

    Map<String, Object> createPeriod(Map<String, Object> b);

    Map<String, Object> budgets();

    Map<String, Object> createBudget(Map<String, Object> b);

    Map<String, Object> budget(long id);

    Map<String, Object> approveBudget(long id);

    Map<String, Object> addLine(long id, Map<String, Object> b);

    Map<String, Object> request(Map<String, Object> b);

    Map<String, Object> approveCommitment(long id);

    Map<String, Object> commit(long id);

    Map<String, Object> disburse(long id, Map<String, Object> b);

    Map<String, Object> reject(long id, Map<String, Object> b);

    Map<String, Object> requestVirement(Map<String, Object> b);

    Map<String, Object> approveVirement(long id);

    Map<String, Object> rejectVirement(long id, Map<String, Object> b);

    Map<String, Object> thresholds();

    Map<String, Object> setThreshold(Map<String, Object> b);

    Map<String, Object> ndmfDonations();

    Map<String, Object> ndmfDisburse(Map<String, Object> b);
}

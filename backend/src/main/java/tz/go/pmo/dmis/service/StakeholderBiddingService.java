package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Stakeholder bidding & donations (third fulfilment channel) plus NDMF fund.
 * Paths and JSON unchanged from the former response package.
 * DispatchSupportService + SimulationGuard + NotificationService retained.
 */
public interface StakeholderBiddingService {

    Map<String, Object> publish(long id, Map<String, Object> body);

    Map<String, Object> pool(long id);

    Map<String, Object> submitBid(Map<String, Object> body);

    Map<String, Object> pledge(Map<String, Object> body);

    Map<String, Object> accept(long id, Map<String, Object> body);

    Map<String, Object> dismiss(long id, Map<String, Object> body);

    Map<String, Object> receive(long id, Map<String, Object> body);

    Map<String, Object> returnToDispatch(long id);

    Map<String, Object> closeBidding(long id);

    Map<String, Object> donations(String status, String search);

    Map<String, Object> openNeeds(String region, String category);

    Map<String, Object> ndmfDonations();

    Map<String, Object> recordNdmfDonation(Map<String, Object> body);

    Map<String, Object> ndmfFund();

    Map<String, Object> ndmfDonationStatus(long id, Map<String, Object> body);

    Map<String, Object> disburseTraining(Map<String, Object> body);

    Map<String, Object> disburseProcurement(Map<String, Object> body);

    Map<String, Object> voidDisbursement(long id);
}

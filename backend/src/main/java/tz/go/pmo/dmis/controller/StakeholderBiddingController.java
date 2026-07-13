package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.StakeholderBiddingService;

/**
 * Response → Stakeholder Bidding & Donations / NDMF. Thin eGA controller; logic in
 * {@link StakeholderBiddingService}. Paths and JSON unchanged from the former response package.
 */
@RestController
@RequestMapping("/v1/response/bidding")
@RequiredArgsConstructor
public class StakeholderBiddingController {

    private final StakeholderBiddingService service;

    @PostMapping("/allocations/{id}/publish")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    public Map<String, Object> publish(@PathVariable long id,
                                       @RequestBody(required = false) Map<String, Object> body) {
        return service.publish(id, body);
    }

    @GetMapping("/allocations/{id}/pool")
    @PreAuthorize("hasAuthority('resource_allocation.view')")
    public Map<String, Object> pool(@PathVariable long id) {
        return service.pool(id);
    }

    @PostMapping("/bids")
    @PreAuthorize("hasAnyAuthority('resource_allocation.request','stakeholder_portal.donate')")
    public Map<String, Object> submitBid(@RequestBody Map<String, Object> body) {
        return service.submitBid(body);
    }

    @PostMapping("/pledge")
    @PreAuthorize("hasAnyAuthority('resource_allocation.request','stakeholder_portal.donate')")
    public Map<String, Object> pledge(@RequestBody Map<String, Object> body) {
        return service.pledge(body);
    }

    @PostMapping("/bids/{id}/accept")
    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    public Map<String, Object> accept(@PathVariable long id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        return service.accept(id, body);
    }

    @PostMapping("/bids/{id}/dismiss")
    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    public Map<String, Object> dismiss(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.dismiss(id, body);
    }

    @PostMapping("/bids/{id}/receive")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    public Map<String, Object> receive(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.receive(id, body);
    }

    @PostMapping("/allocations/{id}/return-to-dispatch")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    public Map<String, Object> returnToDispatch(@PathVariable long id) {
        return service.returnToDispatch(id);
    }

    @PostMapping("/allocations/{id}/close-bidding")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    public Map<String, Object> closeBidding(@PathVariable long id) {
        return service.closeBidding(id);
    }

    @GetMapping("/donations")
    @PreAuthorize("hasAnyAuthority('resource_allocation.view','stakeholder_portal.donate')")
    public Map<String, Object> donations(@RequestParam(required = false) String status,
                                         @RequestParam(required = false) String search) {
        return service.donations(status, search);
    }

    @GetMapping("/open-needs")
    @PreAuthorize("hasAuthority('resource_allocation.view')")
    public Map<String, Object> openNeeds(@RequestParam(required = false) String region,
                                         @RequestParam(required = false) String category) {
        return service.openNeeds(region, category);
    }

    @GetMapping("/ndmf-donations")
    @PreAuthorize("hasAuthority('resource_allocation.view')")
    public Map<String, Object> ndmfDonations() {
        return service.ndmfDonations();
    }

    @PostMapping("/ndmf-donations")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    public Map<String, Object> recordNdmfDonation(@RequestBody Map<String, Object> body) {
        return service.recordNdmfDonation(body);
    }

    @GetMapping("/ndmf-fund")
    @PreAuthorize("hasAuthority('resource_allocation.view')")
    public Map<String, Object> ndmfFund() {
        return service.ndmfFund();
    }

    @PostMapping("/ndmf-donations/{id}/status")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    public Map<String, Object> ndmfDonationStatus(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.ndmfDonationStatus(id, body);
    }

    @PostMapping("/ndmf-disbursements/training")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    public Map<String, Object> disburseTraining(@RequestBody Map<String, Object> body) {
        return service.disburseTraining(body);
    }

    @PostMapping("/ndmf-disbursements/procurement")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    public Map<String, Object> disburseProcurement(@RequestBody Map<String, Object> body) {
        return service.disburseProcurement(body);
    }

    @PostMapping("/ndmf-disbursements/{id}/void")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    public Map<String, Object> voidDisbursement(@PathVariable long id) {
        return service.voidDisbursement(id);
    }
}

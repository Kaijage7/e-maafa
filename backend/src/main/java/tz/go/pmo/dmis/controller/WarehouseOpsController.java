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
import tz.go.pmo.dmis.service.WarehouseOpsService;

/**
 * Response → Warehouse Operations. Thin eGA controller; logic in
 * {@link WarehouseOpsService}. Paths and JSON unchanged from the former response package.
 */
@RestController
@RequestMapping("/v1/response/warehouse-ops")
@RequiredArgsConstructor
public class WarehouseOpsController {

    private final WarehouseOpsService service;

    @GetMapping
    public Map<String, Object> index() {
        return service.index();
    }

    @GetMapping("/stock")
    public Map<String, Object> stockFor(@RequestParam String warehouse_type, @RequestParam long warehouse_id) {
        return service.stockFor(warehouse_type, warehouse_id);
    }

    @PostMapping("/intake")
    @PreAuthorize("hasAuthority('warehouse_and_stock.manage')")
    public Map<String, Object> intake(@RequestBody Map<String, Object> body) {
        return service.intake(body);
    }

    @PostMapping("/remove")
    @PreAuthorize("hasAuthority('warehouse_and_stock.manage')")
    public Map<String, Object> remove(@RequestBody Map<String, Object> body) {
        return service.remove(body);
    }

    @PostMapping("/transfer")
    @PreAuthorize("hasAuthority('warehouse_and_stock.manage')")
    public Map<String, Object> transfer(@RequestBody Map<String, Object> body) {
        return service.transfer(body);
    }

    @GetMapping("/movements")
    public Map<String, Object> movements(@RequestParam(required = false) String movement_type,
                                         @RequestParam(required = false) Long resource_id,
                                         @RequestParam(required = false) String warehouse_type,
                                         @RequestParam(required = false) Long warehouse_id) {
        return service.movements(movement_type, resource_id, warehouse_type, warehouse_id);
    }

    @GetMapping("/stock-taking")
    public Map<String, Object> stockTakingSheet(@RequestParam long warehouse_id) {
        return service.stockTakingSheet(warehouse_id);
    }

    @PostMapping("/stock-taking")
    @PreAuthorize("hasAuthority('warehouse_and_stock.manage')")
    public Map<String, Object> processStockTaking(@RequestBody Map<String, Object> body) {
        return service.processStockTaking(body);
    }

    @GetMapping("/capacity")
    public Map<String, Object> capacity() {
        return service.capacity();
    }

    @PostMapping("/borrow")
    @PreAuthorize("hasAuthority('warehouse_and_stock.manage')")
    public Map<String, Object> borrow(@RequestBody Map<String, Object> body) {
        return service.borrow(body);
    }

    @GetMapping("/loans")
    public Map<String, Object> loans(@RequestParam(required = false) String status) {
        return service.loans(status);
    }

    @PostMapping("/loans/{id}/return")
    @PreAuthorize("hasAuthority('warehouse_and_stock.manage')")
    public Map<String, Object> returnLoan(@PathVariable long id,
                                          @RequestBody(required = false) Map<String, Object> body) {
        return service.returnLoan(id, body);
    }
}

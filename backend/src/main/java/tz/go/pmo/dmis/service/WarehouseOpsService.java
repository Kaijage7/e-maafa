package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Warehouse operations on the inventory_items ledger: intake, removal, transfer,
 * movements journal, stock-taking, capacity, and inter-warehouse loans.
 * Paths and JSON unchanged from the former response package.
 * DispatchSupportService + SimulationGuard retained as transitional hubs.
 */
public interface WarehouseOpsService {

    Map<String, Object> index();

    Map<String, Object> stockFor(String warehouseType, long warehouseId);

    Map<String, Object> intake(Map<String, Object> body);

    Map<String, Object> remove(Map<String, Object> body);

    Map<String, Object> transfer(Map<String, Object> body);

    Map<String, Object> movements(String movementType, Long resourceId, String warehouseType, Long warehouseId);

    Map<String, Object> stockTakingSheet(long warehouseId);

    Map<String, Object> processStockTaking(Map<String, Object> body);

    Map<String, Object> capacity();

    Map<String, Object> borrow(Map<String, Object> body);

    Map<String, Object> loans(String status);

    Map<String, Object> returnLoan(long id, Map<String, Object> body);
}

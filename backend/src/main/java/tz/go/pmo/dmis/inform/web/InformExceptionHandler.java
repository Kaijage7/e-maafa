package tz.go.pmo.dmis.inform.web;

import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.NoSuchElementException;
import java.util.Map;

/**
 * Turns the service's domain exceptions into honest HTTP status codes instead of opaque 500s, scoped to the
 * INFORM controllers so it doesn't change error handling elsewhere when this folds into DMIS.
 *   unknown indicator/value/area  → 404
 *   wrong state (not pending) / concurrent approve → 409
 *   bad input (non-numeric raw, etc.)             → 400
 */
@RestControllerAdvice(assignableTypes = InformController.class)
public class InformExceptionHandler {

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<Map<String, Object>> notFound(NoSuchElementException e) {
        return body(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler({ IllegalStateException.class, OptimisticLockingFailureException.class })
    public ResponseEntity<Map<String, Object>> conflict(Exception e) {
        return body(HttpStatus.CONFLICT, e.getMessage());
    }

    @ExceptionHandler({ IllegalArgumentException.class, NumberFormatException.class })
    public ResponseEntity<Map<String, Object>> badRequest(Exception e) {
        return body(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    private static ResponseEntity<Map<String, Object>> body(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of("status", status.value(), "error", message == null ? status.getReasonPhrase() : message));
    }
}

package tz.go.pmo.dmis.common.error;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Translates exceptions into RFC 7807 {@code application/problem+json} responses.
 * <p>VAPT (PMO Protective Security Assessment, June 2026) — debug / stack / SQL leakage:
 * every handler returns a safe title/detail only. Unexpected exceptions are logged server-side
 * and returned as a generic 500 with <em>no</em> stack, SQL, or environment details.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ResourceNotFoundException.class)
    ProblemDetail handleNotFound(ResourceNotFoundException ex) {
        return problem(HttpStatus.NOT_FOUND, "Not found", ex.getMessage());
    }

    /**
     * Unknown API paths (Spring 6 {@code NoResourceFoundException}) must be 404, not a 500
     * "Internal error" that operators misread as a broken service.
     */
    @ExceptionHandler(org.springframework.web.servlet.resource.NoResourceFoundException.class)
    ProblemDetail handleNoResource(org.springframework.web.servlet.resource.NoResourceFoundException ex) {
        return problem(HttpStatus.NOT_FOUND, "Not found", "No endpoint matches this path.");
    }

    /**
     * Wrong HTTP method on a path that exists for other methods (e.g. GET /translations/map when only
     * PUT/DELETE /translations/{id} exist). Must be 405, not a leaked 500.
     */
    @ExceptionHandler(org.springframework.web.HttpRequestMethodNotSupportedException.class)
    ProblemDetail handleMethodNotSupported(org.springframework.web.HttpRequestMethodNotSupportedException ex) {
        return problem(HttpStatus.METHOD_NOT_ALLOWED, "Method not allowed",
                "This path does not support " + ex.getMethod() + ".");
    }

    /**
     * Path variable type mismatch (e.g. /translations/map matched /{id} long). Clean 400, not 500.
     */
    @ExceptionHandler(org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class)
    ProblemDetail handleTypeMismatch(org.springframework.web.method.annotation.MethodArgumentTypeMismatchException ex) {
        return problem(HttpStatus.BAD_REQUEST, "Invalid path parameter",
                "A path parameter has the wrong type.");
    }

    @ExceptionHandler(BusinessRuleException.class)
    ProblemDetail handleBusinessRule(BusinessRuleException ex) {
        return problem(HttpStatus.UNPROCESSABLE_ENTITY, "Business rule violated", ex.getMessage());
    }

    @ExceptionHandler(AccessDeniedException.class)
    ProblemDetail handleAccessDenied(AccessDeniedException ex) {
        return problem(HttpStatus.FORBIDDEN, "Forbidden", "You are not authorized to perform this action.");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, "Validation failed", "One or more fields are invalid.");
        Map<String, String> fieldErrors = new LinkedHashMap<>();
        for (FieldError error : ex.getBindingResult().getFieldErrors()) {
            fieldErrors.putIfAbsent(error.getField(), error.getDefaultMessage());
        }
        problem.setProperty("errors", fieldErrors);
        return problem;
    }

    /**
     * Unguarded parse failures (a numeric or date field received a malformed value) — fail safe
     * with a clean 400 instead of leaking a raw 500. Covers the numeric/date input tail.
     */
    @ExceptionHandler({NumberFormatException.class, DateTimeParseException.class})
    ProblemDetail handleBadInput(RuntimeException ex) {
        return problem(HttpStatus.BAD_REQUEST, "Invalid input",
                "A numeric or date field contains a malformed value.");
    }

    /**
     * Oversize upload — the file exceeded the multipart cap (10 MB). Distinct from the generic multipart
     * handler so the operator sees the real reason (they DID attach a file) instead of "attach a file".
     * More specific than MultipartException, so Spring prefers this handler for the size case.
     */
    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    ProblemDetail handleUploadTooLarge(org.springframework.web.multipart.MaxUploadSizeExceededException ex) {
        return problem(HttpStatus.PAYLOAD_TOO_LARGE, "File too large",
                "The PDF is too large. Bulletin PDFs must be 10 MB or smaller.");
    }

    /**
     * Malformed file uploads — a non-multipart request, or a required file part missing — fail with a clean
     * 400 instead of a raw 500. Covers the EOCC bulletin upload + EW product store endpoints.
     */
    @ExceptionHandler({org.springframework.web.multipart.MultipartException.class,
            org.springframework.web.multipart.support.MissingServletRequestPartException.class})
    ProblemDetail handleMultipart(Exception ex) {
        return problem(HttpStatus.BAD_REQUEST, "Invalid upload",
                "The upload must include the required file. Attach a file and try again.");
    }

    /** queryForObject/queryForMap against a missing row — treat as 404, not 500. */
    @ExceptionHandler(EmptyResultDataAccessException.class)
    ProblemDetail handleEmptyResult(EmptyResultDataAccessException ex) {
        return problem(HttpStatus.NOT_FOUND, "Not found", "The requested record does not exist.");
    }

    /**
     * Database integrity violations — branch on the Postgres SQLState of the root cause so the client
     * gets an ACCURATE status + message instead of a blanket 409 "duplicate". A NOT-NULL or CHECK
     * violation is a 400 the user can fix, not a 409 "duplicate" that misleads them.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail handleIntegrity(DataIntegrityViolationException ex) {
        String state = sqlState(ex);
        return switch (state == null ? "" : state) {
            case "23505" -> problem(HttpStatus.CONFLICT, "Conflict",
                    "A record with the same unique value already exists.");
            case "23503" -> problem(HttpStatus.CONFLICT, "Conflict",
                    "This record references another record that does not exist, or is still referenced by other records.");
            case "23502" -> problem(HttpStatus.BAD_REQUEST, "Missing required field",
                    "A required field was not provided.");
            case "23514" -> problem(HttpStatus.BAD_REQUEST, "Invalid value",
                    "A field value is outside the allowed range.");
            case "22001" -> problem(HttpStatus.BAD_REQUEST, "Value too long",
                    "A field value exceeds its maximum length.");
            case "22007", "22008", "22P02" -> problem(HttpStatus.BAD_REQUEST, "Invalid input",
                    "A date or number field contains an invalid value.");
            default -> problem(HttpStatus.CONFLICT, "Conflict",
                    "The request conflicts with existing data (a duplicate or a referenced record).");
        };
    }

    /** Walk the cause chain to the underlying SQLException and read its Postgres SQLState. */
    private static String sqlState(Throwable ex) {
        for (Throwable t = ex; t != null; t = t.getCause()) {
            if (t instanceof java.sql.SQLException se && se.getSQLState() != null) {
                return se.getSQLState();
            }
        }
        return null;
    }

    /**
     * Hand-thrown ResponseStatusException (the repository/Sendai services use these): surface its
     * REASON to the client. Previously these fell through with no body, so the UI showed a blank
     * "Action not allowed" and data-entry mistakes were undiagnosable.
     */
    @ExceptionHandler(org.springframework.web.server.ResponseStatusException.class)
    ProblemDetail handleResponseStatus(org.springframework.web.server.ResponseStatusException ex) {
        HttpStatus status = HttpStatus.resolve(ex.getStatusCode().value());
        if (status == null) { status = HttpStatus.INTERNAL_SERVER_ERROR; }
        return problem(status, status.getReasonPhrase(),
                ex.getReason() == null ? "The request could not be completed." : ex.getReason());
    }

    /**
     * Any other {@link DataAccessException} (not already handled as integrity/empty) — never surface
     * SQLSTATE text, table names, or query fragments to the client (VAPT vii / SQL disclosure).
     */
    @ExceptionHandler(DataAccessException.class)
    ProblemDetail handleDataAccess(DataAccessException ex) {
        log.error("Data access failure (details withheld from client): {}", ex.getMessage());
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "Request failed",
                "The request could not be completed. Please try again or contact support.");
    }

    /**
     * Last-resort catch-all so no unhandled exception can leak stack traces or environment into the
     * JSON body (production must never show debug pages / Flare / Whoops-style dumps).
     */
    @ExceptionHandler(Exception.class)
    ProblemDetail handleUnexpected(Exception ex) {
        log.error("Unhandled exception (details withheld from client)", ex);
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "Internal error",
                "An unexpected error occurred. Please try again later.");
    }

    private ProblemDetail problem(HttpStatus status, String title, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        problem.setProperty("timestamp", Instant.now());
        // Alias the reason as "message" too: ProblemDetail puts it in "detail", but several frontends
        // read err.error.message — expose both so the reason always reaches the UI.
        problem.setProperty("message", detail);
        return problem;
    }
}

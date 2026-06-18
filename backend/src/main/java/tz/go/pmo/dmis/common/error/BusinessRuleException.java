package tz.go.pmo.dmis.common.error;

/** Raised when an operation would violate a domain invariant. Mapped to HTTP 422. */
public class BusinessRuleException extends RuntimeException {

    public BusinessRuleException(String message) {
        super(message);
    }
}

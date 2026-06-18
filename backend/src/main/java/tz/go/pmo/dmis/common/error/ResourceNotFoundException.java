package tz.go.pmo.dmis.common.error;

/** Raised when a requested aggregate does not exist. Mapped to HTTP 404. */
public class ResourceNotFoundException extends RuntimeException {

    public ResourceNotFoundException(String message) {
        super(message);
    }

    public static ResourceNotFoundException of(String type, Object id) {
        return new ResourceNotFoundException(type + " " + id + " was not found");
    }
}

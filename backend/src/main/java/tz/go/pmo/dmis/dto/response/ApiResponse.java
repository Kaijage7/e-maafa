package tz.go.pmo.dmis.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Standard eGA-style API envelope: {@code { status, message, data }}.
 *
 * <p>All new controllers should return this type (or {@code ResponseEntity<ApiResponse<T>>}).
 * Legacy endpoints that still return raw maps may be wrapped incrementally.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiResponse<T> {

    private final String status;
    private final String message;
    private final T data;

    private ApiResponse(String status, String message, T data) {
        this.status = status;
        this.message = message;
        this.data = data;
    }

    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>("success", "OK", data);
    }

    public static <T> ApiResponse<T> success(String message, T data) {
        return new ApiResponse<>("success", message, data);
    }

    public static <T> ApiResponse<T> fail(String message) {
        return new ApiResponse<>("error", message, null);
    }

    public static <T> ApiResponse<T> fail(String message, T data) {
        return new ApiResponse<>("error", message, data);
    }

    public String getStatus() {
        return status;
    }

    public String getMessage() {
        return message;
    }

    public T getData() {
        return data;
    }
}

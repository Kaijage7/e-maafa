/**
 * eGA layer — presentation / REST API.
 *
 * <p>All {@code @RestController} classes live here. Controllers are thin: validate input,
 * call a {@code service} interface, return a standard {@code ApiResponse} (or
 * {@code ResponseEntity}). No business rules and no direct JDBC/JPA access.
 *
 * <p>Aligned with eGA de facto Spring Boot structure used on GovESB-connected systems.
 */
package tz.go.pmo.dmis.controller;

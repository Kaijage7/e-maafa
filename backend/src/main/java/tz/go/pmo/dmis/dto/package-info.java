/**
 * eGA layer — data transfer objects (request / response).
 *
 * <p>API contracts only — not entities. Sub-packages:
 * <ul>
 *   <li>{@code dto.request} — write payloads</li>
 *   <li>{@code dto.response} — read models returned to clients</li>
 * </ul>
 * Map entity ↔ DTO via {@code mapper} (ModelMapper / MapStruct), never expose entities on the wire.
 */
package tz.go.pmo.dmis.dto;

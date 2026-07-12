/**
 * eGA layer — data access ({@code JpaRepository} / Spring Data interfaces).
 *
 * <p><b>Target:</b> only persistence interfaces (e.g. {@code IncidentRepository extends JpaRepository}).
 *
 * <p><b>Transition:</b> this package historically also held the Sendai/Disaster-loss <em>feature</em>
 * controllers ({@code DisasterEventController}, etc.). Those classes remain until they are moved to
 * {@code controller} + {@code service} under the eGA layout. New JPA repositories may still be
 * added here; do not add new feature controllers into this package.
 */
package tz.go.pmo.dmis.repository;

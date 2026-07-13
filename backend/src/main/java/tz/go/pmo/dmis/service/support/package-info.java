/**
 * Shared Response / EW operational engines (not thin REST controllers).
 * <p>These are intentional <b>eGA service-layer hubs</b> used by multiple thin controllers:
 * incident workflow, approval workflow, dispatch/stock support, activation, simulation guard,
 * and exercise inject scheduling. Kept under {@code service.support} so new work does not
 * re-grow fat controllers under a legacy {@code response} package.
 */
package tz.go.pmo.dmis.service.support;

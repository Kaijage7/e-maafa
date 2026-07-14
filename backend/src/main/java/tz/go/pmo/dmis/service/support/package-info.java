/**
 * Shared operational engines (not thin REST controllers).
 * <p>Intentional <b>eGA service-layer hubs</b> used by multiple thin controllers / service.impls:
 * incident workflow, approval workflow, dispatch/stock support, activation, simulation guard,
 * exercise inject scheduling, TOTP, recipients helpers, and One Health event helpers.
 * Kept under {@code service.support} so new work does not re-grow fat controllers under legacy
 * feature packages.
 */
package tz.go.pmo.dmis.service.support;

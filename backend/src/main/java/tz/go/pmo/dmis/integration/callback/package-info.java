/**
 * Async integration callbacks — endpoints GovESB (and peers) POST results to.
 *
 * <p>eGA async pattern: long-running services respond on a registered callback URL.
 * Controllers here verify signatures and hand off to {@code service} implementations.
 */
package tz.go.pmo.dmis.integration.callback;

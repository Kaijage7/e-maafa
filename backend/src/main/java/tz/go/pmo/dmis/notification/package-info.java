/**
 * Shared multi-channel delivery spine (not thin REST).
 *
 * <p>HTTP feed/preferences live under {@code controller} + {@code service.impl}. This package keeps the
 * single dispatcher, mail/SMS async delivery, audience resolution and retry scheduler so every domain
 * shares one auditable path. Do not add domain controllers here.
 */
package tz.go.pmo.dmis.notification;

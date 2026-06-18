package tz.go.pmo.dmis;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Entry point for the DMIS platform backend.
 *
 * <p>The application is a modular monolith: each disaster-management bounded context
 * (population registry, early warning, incidents, logistics, ...) lives in its own
 * package and communicates with others only through domain events on the outbox.
 * Scheduling is enabled for the outbox relay and stock-reconciliation jobs.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableJpaAuditing(auditorAwareRef = "auditorProvider")
@EnableScheduling
public class DmisPlatformApplication {

    public static void main(String[] args) {
        SpringApplication.run(DmisPlatformApplication.class, args);
    }
}

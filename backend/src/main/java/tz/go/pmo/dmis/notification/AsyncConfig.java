package tz.go.pmo.dmis.notification;

import java.util.concurrent.Executor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * Enables @Async so external notification delivery (SMS / email) runs off the request thread —
 * a flow that notifies many users returns immediately while the gateway calls happen in the
 * background. A small bounded pool keeps SMTP/SMS latency from starving the web threads.
 */
@Configuration
@EnableAsync
public class AsyncConfig {

    @Bean(name = "notificationExecutor")
    public Executor notificationExecutor() {
        ThreadPoolTaskExecutor ex = new ThreadPoolTaskExecutor();
        ex.setCorePoolSize(2);
        ex.setMaxPoolSize(6);
        ex.setQueueCapacity(200);
        ex.setThreadNamePrefix("notify-");
        ex.initialize();
        return ex;
    }
}

package tz.go.pmo.dmis.common.security;

import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Proves the login throttle ({@link LoginRateLimitFilter}) is actually registered in the running
 * filter chain and intercepts the real public {@code POST /v1/auth/login} before the authenticator:
 * with the default budget (10 attempts / 60s) the 11th attempt from one client IP gets 429, while the
 * first 10 reach the controller (401 for unknown credentials, not throttled). A fixed TEST-NET-3
 * client IP keeps the window isolated from any other test sharing the cached context.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class LoginRateLimitIntegrationTest {

    private static final String TEST_IP = "203.0.113.77";
    private static final String BODY = "{\"email\":\"nobody-ratelimit@example.com\",\"password\":\"wrong-password\"}";

    @Autowired
    private MockMvc mvc;

    @Test
    void eleventhLoginAttemptFromOneIpIsThrottled() throws Exception {
        for (int i = 0; i < 10; i++) {
            int status = mvc.perform(post("/v1/auth/login")
                            .contentType(MediaType.APPLICATION_JSON).content(BODY)
                            .with(request -> {
                                request.setRemoteAddr(TEST_IP);
                                return request;
                            }))
                    .andReturn().getResponse().getStatus();
            assertNotEquals(429, status, "attempt " + (i + 1) + " is within the budget, not throttled");
        }

        mvc.perform(post("/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON).content(BODY)
                        .with(request -> {
                            request.setRemoteAddr(TEST_IP);
                            return request;
                        }))
                .andExpect(status().isTooManyRequests());
    }
}

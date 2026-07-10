package tz.go.pmo.dmis.common.security;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Filters that are wired into {@link SecurityFilterChain} must not also auto-register as
 * servlet filters (would run twice / before SecurityContext is ready).
 */
@Configuration
public class SecurityChainFilterRegistration {

    @Bean
    FilterRegistrationBean<TokenRevocationFilter> disableServletTokenRevocation(TokenRevocationFilter f) {
        FilterRegistrationBean<TokenRevocationFilter> reg = new FilterRegistrationBean<>(f);
        reg.setEnabled(false);
        return reg;
    }

    @Bean
    FilterRegistrationBean<RestrictedTokenUseFilter> disableServletRestrictedToken(RestrictedTokenUseFilter f) {
        FilterRegistrationBean<RestrictedTokenUseFilter> reg = new FilterRegistrationBean<>(f);
        reg.setEnabled(false);
        return reg;
    }
}

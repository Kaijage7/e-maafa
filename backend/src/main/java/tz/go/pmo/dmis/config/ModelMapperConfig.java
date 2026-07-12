package tz.go.pmo.dmis.config;

import org.modelmapper.ModelMapper;
import org.modelmapper.convention.MatchingStrategies;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * eGA-style entity ↔ DTO mapping. Active only when ModelMapper is on the classpath.
 * Add {@code org.modelmapper:modelmapper} to the backend POM when starting DTO migrations.
 */
@Configuration
@ConditionalOnClass(name = "org.modelmapper.ModelMapper")
public class ModelMapperConfig {

    @Bean
    public ModelMapper modelMapper() {
        ModelMapper mapper = new ModelMapper();
        mapper.getConfiguration()
                .setMatchingStrategy(MatchingStrategies.STRICT)
                .setSkipNullEnabled(true)
                .setAmbiguityIgnored(true);
        return mapper;
    }
}

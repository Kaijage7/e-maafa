package tz.go.pmo.dmis.common.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Serves uploaded documents the way Laravel's {@code Storage::url()} does (public disk →
 * {@code /storage/<relative-path>}). With the {@code /api} context path the effective URL is
 * {@code /api/storage/**}, which the Angular dev proxy already forwards. The root is shared with
 * the services that store files ({@code dmis.storage.public-root}).
 */
@Configuration
public class PublicStorageConfig implements WebMvcConfigurer {

    @Value("${dmis.storage.public-root:${user.dir}/storage/public}")
    private String publicRoot;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/storage/**")
                .addResourceLocations("file:" + (publicRoot.endsWith("/") ? publicRoot : publicRoot + "/"));
    }
}

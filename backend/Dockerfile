# DMIS backend — reproducible build + runtime image (F25).
# Multi-stage: build the Spring Boot fat jar with Maven, run on a slim JRE.

# ---- build stage ----
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
# Cache dependencies first (pom changes rarely), then the source.
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
# Tests run in CI (they need Postgres); the image build packages the artifact.
RUN mvn -B -q -DskipTests clean package

# ---- runtime stage ----
FROM eclipse-temurin:21-jre
WORKDIR /app
# The Spring Boot repackaged (executable) jar; the plain .jar.original is not matched by *.jar.
COPY --from=build /build/target/dmis-platform-*.jar /app/app.jar
EXPOSE 8080
# Production security chain by default (NOT the local X-Local-Roles persona). Override env at run time:
#   DB_HOST/DB_PORT/DB_NAME/DB_USERNAME/DB_PASSWORD, DMIS_AUTH_JWT_SECRET (>= 32 bytes; app fails fast otherwise).
ENV SPRING_PROFILES_ACTIVE=prod
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "/app/app.jar"]

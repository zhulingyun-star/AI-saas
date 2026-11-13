FROM maven:3.9.9-eclipse-temurin-17 AS build
WORKDIR /source
COPY backend/pom.xml backend/maven-settings.xml ./
RUN mvn -s maven-settings.xml -B -q dependency:go-offline
COPY backend/src src
RUN mvn -s maven-settings.xml -B -q -DskipTests package

FROM eclipse-temurin:17-jre-jammy
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 10001 app && useradd -u 10001 -g app -d /app app \
    && mkdir -p /app/data/media && chown -R app:app /app
WORKDIR /app
COPY --from=build --chown=app:app /source/target/workbench-0.1.0.jar app.jar
USER app
ENV STORAGE_PATH=/app/data/media JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -Dfile.encoding=UTF-8"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]

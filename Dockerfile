FROM amazoncorretto:17
WORKDIR /build
COPY ./backend/build/libs/*.jar app.jar
RUN jar -xf app.jar && jdeps -q \
    --ignore-missing-deps \
    --print-module-deps \
    --recursive \
    --multi-release 17 \
    --class-path="BOOT-INF/lib/*" \
    --module-path="BOOT-INF/lib/*" \
    app.jar > /deps
RUN jlink \
    --verbose \
    --add-modules $(cat /deps) \
    --strip-java-debug-attributes \
    --no-man-pages \
    --no-header-files \
    --compress=2 \
    --output /jre
RUN mkdir /app && cp -r META-INF /app && cp -r BOOT-INF/classes/* /app

FROM gcr.io/distroless/java-base-debian11
WORKDIR /data/symphony
COPY --from=0 /jre /jre
COPY --from=0 /build/BOOT-INF/lib /lib
COPY --from=0 /app .
ENTRYPOINT [ \
  "/jre/bin/java", \
  "-cp", ".:/lib/*", \
  "com.symphony.devsol.WdkStudioBackend", \
  "--spring.profiles.active=prod" \
]

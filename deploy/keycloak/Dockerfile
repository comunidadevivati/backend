# syntax=docker/dockerfile:1.7

FROM quay.io/keycloak/keycloak:26.8.0 AS build

ENV KC_DB=postgres
ENV KC_HEALTH_ENABLED=true

COPY --chown=keycloak:keycloak deploy/keycloak/themes/ /opt/keycloak/themes/

RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.8.0

COPY --from=build --chown=keycloak:keycloak /opt/keycloak/ /opt/keycloak/

ENV KC_DB=postgres
ENV KC_CACHE=local
ENV KC_HEALTH_ENABLED=true
ENV KC_HTTP_ENABLED=true
ENV KC_HTTP_PORT=10000
ENV KC_PROXY_HEADERS=xforwarded
ENV KC_HTTP_POOL_MAX_THREADS=20
ENV JAVA_OPTS_KC_HEAP="-XX:InitialRAMPercentage=20 -XX:MaxRAMPercentage=45 -XX:MinHeapFreeRatio=10 -XX:MaxHeapFreeRatio=30 -XX:+ExitOnOutOfMemoryError"

EXPOSE 10000

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized"]

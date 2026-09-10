# Keycloak 26.7.3 optimized image (production-style local test)
# Build: builds the server image with DB/config once; runtime uses optimized start
FROM quay.io/keycloak/keycloak:26.7.3
# Build-time: configure DB and basic settings (no --proxy; proxy is runtime)
RUN /opt/keycloak/bin/kc.sh build --db=postgres --db-url=jdbc:postgresql://postgres:5432/keycloak --db-username=keycloak --db-password=keycloak --http-enabled=true --hostname=localhost --hostname-strict=false --health-enabled=true

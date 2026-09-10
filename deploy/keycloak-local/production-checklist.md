# Keycloak 26.7.3 — Production Requirements (summary)

# Source: https://github.com/keycloak/keycloak/releases/tag/26.7.3

#

# Production checklist before deploying 26.7.3:

# - Use persistent database: PostgreSQL / MySQL / Oracle (NOT H2)

# - Resources: minimum 2-4 GB RAM, 2 CPU cores (scale for load)

# - Image: quay.io/keycloak/keycloak:26.7.3

# - Set KC_HOSTNAME properly

# - Configure TLS / HTTPS (certificates or reverse proxy)

# - Set KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD securely

# - Configure DB connection params (KC_DB, KC_DB_URL, etc.)

# - Disable start-dev in production

# - Check release notes for LDAP/OIDC/admin-permission CVE fixes

# - Monitor ingress/reverse proxy (nginx/traefik) settings

#

# For Docker Desktop Kubernetes testing see: keycloak-26.7.3-local.yaml

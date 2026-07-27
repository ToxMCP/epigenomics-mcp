# Security Policy

## Supported versions

Security fixes are made against the latest `0.2.x` release line and `main`.
Older pre-release versions are not supported.

## Reporting a vulnerability

Use the repository's [private vulnerability reporting
form](https://github.com/ToxMCP/epigenomics-mcp/security/advisories/new).
Do not open a public issue for an undisclosed vulnerability and do not include
credentials, patient data, or other sensitive research data.

Include the affected version, transport, minimal reproduction, impact, and any
suggested mitigation. Maintainers should acknowledge a report within five
business days and coordinate disclosure after a fix or documented mitigation
is available.

## Deployment boundary

The stdio transport is the default. Streamable HTTP binds to loopback by
default. A non-loopback bind requires an explicit Host allowlist and bearer
token; production deployments should also use TLS termination, secret
rotation, network policy, and centralized audit logging.

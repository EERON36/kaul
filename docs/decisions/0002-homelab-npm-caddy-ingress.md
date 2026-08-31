# ADR 0002: Keep NPM at the Homelab edge and Caddy as Kaul's proxy

Status: Accepted for Homelab Pilot preparation

Date: 2026-08-23

## Context

The intended Pilot host is an existing Ubuntu VM in Proxmox. The homelab
already routes public HTTP and HTTPS through Nginx Proxy Manager (NPM). Kaul's
portable deployment architecture already uses Caddy as the only proxy directly
connected to the application.

Replacing NPM would disrupt unrelated homelab ingress. Removing Caddy would
make Kaul operationally depend on a homelab-specific component and make the
later move to a provider unnecessarily different. A two-proxy path also creates
a security boundary: client identity and the public HTTPS scheme must survive
the path without trusting headers supplied by arbitrary Internet clients.

## Decision

The Homelab Pilot path is:

```text
Internet -> router -> NPM -> Kaul VM -> Caddy -> Kaul -> PostgreSQL
```

NPM owns public TLS for the Pilot hostname. It forwards HTTP over the private
LAN to one Caddy listener bound to the Kaul VM's private address, normally TCP
8080. Router public 80/443 forwarding remains directed to NPM. PostgreSQL,
Kaul, SSH, Docker, Proxmox, and management interfaces are not public ingress.

Caddy accepts Homelab requests only from the exact NPM network peer observed
during authorised runtime inspection. That `/32` is a required deployment
input used for both Caddy trust and firewall or equivalent ingress enforcement;
forwarded headers never grant listener access. Caddy uses strict right-to-left
trusted-proxy parsing for `X-Forwarded-For`, then overwrites the Host, HTTPS
scheme, and client-identity headers sent to Kaul. Kaul continues trusting only
Caddy-provided `X-Real-IP` for authentication rate limiting. Host or upstream
firewall controls independently limit the private listener to NPM.

The deployment selects one of two fail-closed ingress configurations:

- `npm`: private HTTP listener, exact NPM peer trust, no public VM 80/443.
- `public`: direct Caddy 80/443, ACME, redirects, and no forwarded-header trust.

This is deployment configuration. It does not add an application `PILOT_MODE`
fork. The eventual provider path removes NPM and selects direct-public Caddy;
the application and PostgreSQL architecture behind Caddy remain unchanged.

## Consequences

- The installed NPM version, generated proxy-host headers, NPM source address,
  Caddy-observed peer, host firewall, and negative non-NPM access must be
  verified on the real network before exposure.
- The public hostname stays parameterized and may later move by DNS cutover.
- The private NPM-to-Caddy hop is HTTP. The Pilot threat model requires public
  TLS termination at NPM, a trusted private homelab path, no direct Internet
  reachability to Caddy, ingress restricted to the observed NPM peer, strict
  forwarded-metadata handling, and unpublished Kaul/PostgreSQL services.
  Internal PKI or mTLS is not required unless inspection identifies a concrete
  untrusted-network risk.
- A VLAN may strengthen isolation but is not automatically a Homelab Pilot
  gate. Docker-aware host, Proxmox, or router controls must still establish the
  minimum boundary.
- NPM availability and certificate renewal are Homelab operational concerns,
  not permanent Kaul application dependencies.

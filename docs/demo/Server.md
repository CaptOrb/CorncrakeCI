# Demo Setup Instructions

1. Run: `docker compose -f docker-compose.demo.yml up --build`
2. Go to http://localhost:3006 and create an admin account
3. Go to Settings > Applications > Manage OAuth2 Applications
4. Create new app:
   - Name: MolCI
   - Redirect URI: http://localhost:3009/api/auth/callback
5. Copy the Client ID and Client Secret
6. Add to docker-compose.demo.yml:
```yaml
   FORGES_1_CLIENTID: "your-client-id"
   FORGES_1_CLIENTSECRET: "your-secret"
```
7. Run: `docker compose -f docker-compose.demo.yml restart molci-server`
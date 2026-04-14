# IronGate Go-Live Implementation Checklist

## 📋 Overview

This document outlines all tasks needed to take IronGate from demo to production with authentication and database.

**Timeline**: ~5 days  
**Estimated Cost**: $30-50/month on AWS  
**User Roles**: Admin, Operator, Analyst, Viewer

---

## ✅ Phase 1: Local Development Setup (Day 1)

### Authentication Implementation

- [ ] Install JWT dependencies
  ```bash
  npm install jsonwebtoken dotenv
  ```

- [ ] Create `.env` file in project root:
  ```bash
  cp .env.example .env
  # Edit .env with local values
  ```

- [ ] Integrate auth endpoints into `backend.js`:
  - Add imports at top: `import { setupAuthEndpoints } from './backend-auth-endpoints.js'`
  - Call `setupAuthEndpoints(app)` before `app.listen()`
  - Test endpoints: `POST /v1/auth/login`

- [ ] Update App.jsx to handle authentication:
  ```jsx
  // Add auth context or localStorage token check
  // Redirect unauthenticated users to /login
  ```

- [ ] Add Login route to React Router (in App.jsx):
  ```jsx
  <Route path="/login" element={<Login />} />
  ```

- [ ] Test locally:
  ```bash
  npm run build && npm run backend
  
  # In another terminal:
  curl -X POST http://localhost:4000/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@irongate.local","password":"Admin@123"}'
  ```

---

## ✅ Phase 2: Database Setup (Day 1-2)

### PostgreSQL Installation

- [ ] **Local Testing** (optional):
  ```bash
  # Mac
  brew install postgresql
  createdb irongate
  psql irongate < database.sql
  
  # Or Docker:
  docker run --name irongate-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres
  ```

- [ ] **AWS RDS Setup**:
  1. [ ] Create AWS account (if needed)
  2. [ ] Create RDS PostgreSQL instance (t3.micro - free tier)
  3. [ ] Note database endpoint: `prod-db.xxxxx.rds.amazonaws.com`
  4. [ ] Save master username & password securely
  5. [ ] Import schema:
     ```bash
     psql -h prod-db.xxxxx.rds.amazonaws.com -U adminuser -d irongate < database.sql
     ```
  6. [ ] Verify seed data:
     ```bash
     psql -h prod-db.xxxxx.rds.amazonaws.com -U adminuser -d irongate -c "SELECT email, role FROM users;"
     ```

---

## ✅ Phase 3: Backend Integration (Day 2)

### Connect Backend to Database

- [ ] Install database driver:
  ```bash
  npm install pg pg-pool
  ```

- [ ] Update `backend.js` to use real database instead of in-memory:
  ```javascript
  import { Pool } from 'pg';
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  // Replace in-memory arrays with database queries
  app.get('/v1/events', async (req, res) => {
    const result = await pool.query('SELECT * FROM events LIMIT 100');
    res.json({ events: result.rows });
  });
  ```

- [ ] Replace mock data endpoints:
  - `/v1/devices` → SELECT from `devices` table
  - `/v1/events` → SELECT from `events` table
  - `/v1/attack-traces` → SELECT from `attack_traces` table
  - etc.

- [ ] Test connections:
  ```bash
  # Check backend logs for database connection errors
  npm run backend
  ```

---

## ✅ Phase 4: Frontend Authentication (Day 2-3)

### React Auth Flow

- [ ] Create auth context or hook (optional but recommended):
  ```jsx
  // src/hooks/useAuth.js
  export function useAuth() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
      const token = localStorage.getItem('authToken');
      if (token) {
        // Verify token with backend
      }
    }, []);
    
    return { user, loading, login, logout };
  }
  ```

- [ ] Protect routes that require authentication:
  ```jsx
  <Route path="/overview" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
  ```

- [ ] Update page components to use token in API calls:
  ```javascript
  const token = localStorage.getItem('authToken');
  fetch('/v1/dashboard', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  ```

- [ ] Test login flow:
  1. Go to http://localhost:3000/login
  2. Enter: `admin@irongate.local` / `Admin@123`
  3. Should redirect to `/overview`
  4. Dashboard should load with real data

---

## ✅ Phase 5: Security Hardening (Day 3)

### Security Checklist

- [ ] Review and update `.env.example`:
  - [ ] Strong JWT_SECRET (use: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
  - [ ] Production database URL
  - [ ] CORS origins

- [ ] Test role-based access:
  - [ ] Login as `viewer@irongate.local` → should see read-only dashboard
  - [ ] Login as `operator@irongate.local` → should see all pages
  - [ ] Login as `admin@irongate.local` → should see admin settings
  - [ ] Try to access `/settings` as viewer → should fail

- [ ] Remove console.logs and debug statements from production code

- [ ] Verify no secrets in code (JWT_SECRET, passwords, API keys):
  ```bash
  # Search for hardcoded secrets
  grep -r "password\|secret\|token" src/ backend.js | grep -v "process.env"
  ```

- [ ] Add rate limiting to auth endpoint:
  ```bash
  npm install express-rate-limit
  ```

---

## ✅ Phase 6: Build & Testing (Day 4)

### Production Build

- [ ] Create production build:
  ```bash
  npm run build
  
  # Check output:
  # ✓ 90 modules transformed  
  # dist/index.html ...
  # dist/assets/index-*.js ... gzipped
  ```

- [ ] Test with production server:
  ```bash
  NODE_ENV=production npm run backend
  
  # Open http://localhost:3000
  # Test login with all roles
  # Verify data loads correctly
  ```

- [ ] Run billing live preflight gate:
  ```bash
  npm run test:billing:live-preflight
  ```
  - Confirms Stripe connectivity, admin auth, billing health endpoint, revenue endpoint, webhook observability, and migration status.

- [ ] Performance checks:
  - [ ] Frontend bundle < 150 KB (gzipped)
  - [ ] Initial page load < 3 seconds
  - [ ] API responses < 500 ms

- [ ] Cross-browser testing:
  - [ ] Chrome ✓
  - [ ] Firefox ✓
  - [ ] Safari ✓
  - [ ] Edge ✓

---

## ✅ Phase 7: AWS Deployment (Day 4-5)

### Infrastructure Setup

- [ ] Follow [AWS_DEPLOYMENT_GUIDE.md](AWS_DEPLOYMENT_GUIDE.md):
  1. [ ] Set up RDS PostgreSQL (already done in Phase 2)
  2. [ ] Create EC2 instance (t3.micro)
  3. [ ] Install Node.js, PM2, and Nginx
  4. [ ] Create `.env` on EC2 with production values
  5. [ ] Deploy backend code
  6. [ ] Deploy frontend build
  7. [ ] Configure Nginx reverse proxy
  8. [ ] Set up domain + SSL (Let's Encrypt)

- [ ] Deploy backend to EC2:
  ```bash
  scp -i key.pem backend.js ec2-user@EC2_IP:~/irongate/
  scp -i key.pem backend-auth-endpoints.js ec2-user@EC2_IP:~/irongate/
  scp -i key.pem package.json ec2-user@EC2_IP:~/irongate/
  
  # SSH into EC2, then:
  cd ~/irongate
  npm install
  pm2 start backend.js --name "irongate-api"
  ```

- [ ] Deploy frontend to EC2:
  ```bash
  scp -i key.pem -r dist ec2-user@EC2_IP:~/irongate/frontend
  ```

- [ ] Configure Nginx and SSL
  - See AWS_DEPLOYMENT_GUIDE.md Step 5

---

## ✅ Phase 8: Post-Deployment Testing (Day 5)

### Smoke Tests

- [ ] Access https://your-domain.com
  - [ ] Home page loads
  - [ ] Login page displays
  - [ ] Can login with admin account
  - [ ] Dashboard shows real data

- [ ] Test each user role:
  - [ ] Admin: Full access ✓
  - [ ] Operator: Can't access settings ✓
  - [ ] Analyst: Read-only except analysis ✓
  - [ ] Viewer: Dashboard only ✓

- [ ] Test API endpoints:
  ```bash
  TOKEN=$(curl -s -X POST https://your-domain.com/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@irongate.local","password":"Admin@123"}' \
    | jq -r .token)
  
  curl -H "Authorization: Bearer $TOKEN" https://your-domain.com/v1/dashboard
  ```

- [ ] Monitor application:
  ```bash
  # SSH into EC2
  pm2 logs irongate-api
  
  # Check database
  psql -h <RDS endpoint> -U adminuser -d irongate -c "SELECT COUNT(*) FROM events;"
  ```

- [ ] Load testing (optional):
  ```bash
  ab -n 100 -c 10 https://your-domain.com/v1/dashboard
  ```

---

## 📊 Monitoring Setup (Optional but Recommended)

- [ ] Set up CloudWatch dashboards:
  - EC2 CPU/Memory/Network
  - RDS Connections/Storage/CPU
  - Application error count

- [ ] Create CloudWatch alarms:
  - [ ] RDS storage > 80%
  - [ ] EC2 CPU > 80% for 5 min
  - [ ] API error rate > 1%

- [ ] Configure SNS notifications for alarms

---

## 🚀 Go-Live Checklist

Before opening to users:

- [ ] All tests passing
- [ ] SSL certificate valid
- [ ] Backups configured (RDS automatic backups)
- [ ] Monitoring alerts set up
- [ ] Documentation for users created
- [ ] Support/incident response plan ready
- [ ] Database credentials stored securely (AWS Secrets Manager)
- [ ] Emergency rollback procedure documented

---

## 📝 Documentation to Create

- [ ] User guide for each role (Admin, Operator, Analyst, Viewer)
- [ ] API documentation (Swagger/OpenAPI optional)
- [ ] Runbook for common issues (login fails, data not loading, etc.)
- [ ] Data backup/restore procedures
- [ ] Disaster recovery plan

---

## 🔗 Quick Reference

**File Locations:**
- Backend auth: `backend-auth-endpoints.js`
- Database schema: `database.sql`
- Environment template: `.env.example`
- AWS guide: `AWS_DEPLOYMENT_GUIDE.md` (this file)
- Login page: `src/pages/Login.jsx`
- Auth utilities: `src/utils/auth.js`

**Test Credentials (Local & Demo):**
```
Admin: admin@irongate.local / Admin@123
Operator: operator@irongate.local / Operator@123
Analyst: analyst@irongate.local / Analyst@123
Viewer: viewer@irongate.local / Viewer@123
```

**Key Endpoints:**
```
POST   /v1/auth/login        → Get JWT token
POST   /v1/auth/logout       → Clear session
GET    /v1/auth/me           → Get current user (requires token)
POST   /v1/auth/verify       → Verify token validity
GET    /v1/dashboard         → Get dashboard data (requires token)
GET    /v1/devices           → Get asset list (requires token)
```

---

## 🆘 Troubleshooting

| Problem | Solution |
|---------|----------|
| Login fails with "Invalid email" | Verify database has seed data: `SELECT * FROM users;` |
| API returns 401 Unauthorized | Token missing or expired. Restart frontend login. |
| Database connection refused | Check RDS security group allows port 5432 from EC2 |
| Frontend shows 502 Bad Gateway | Nginx can't reach backend. SSH EC2: `pm2 logs irongate-api` |
| SSL certificate won't renew | `sudo certbot renew --force-renewal` |
| High AWS costs | Check: RDS storage, data transfer, unused resources |

---

## 📈 Next Steps After Launch

1. **Week 1-2**: Monitor for bugs, collect user feedback
2. **Week 3**: Analyze usage patterns, optimize queries if needed
3. **Month 2**: Consider CloudFront CDN for faster frontend delivery
4. **Month 3**: Evaluate performance, plan scaling if needed

---

## ⏰ Estimated Timeline

| Phase | Duration | Days |
|-------|----------|------|
| Phase 1: Local Setup | 3-4 hours | 1 |
| Phase 2: Database | 2-3 hours | 1-2 |
| Phase 3: Backend Integration | 4-6 hours | 2 |
| Phase 4: Frontend Auth | 3-4 hours | 2-3 |
| Phase 5: Security | 2-3 hours | 3 |
| Phase 6: Build & Testing | 4-5 hours | 4 |
| Phase 7: AWS Deployment | 6-8 hours | 4-5 |
| Phase 8: Testing | 2-3 hours | 5 |
| **TOTAL** | **26-36 hours** | **~5 days** |

---

**Status**: Ready to implement ✓

For questions or blockers, refer to AWS_DEPLOYMENT_GUIDE.md or specific file READMEs.

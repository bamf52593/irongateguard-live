# AWS Deployment Guide for IronGate

## Prerequisites

- AWS Account (create at https://aws.amazon.com if needed)
- AWS CLI installed (`aws --version`)
- Node.js 16+ (for local testing)
- PostgreSQL client tools (for database migration)

---

## Step 1: Set Up RDS PostgreSQL Database

### 1.1 Create RDS Database via AWS Console

1. Go to AWS Console → RDS → Databases
2. Click "Create database"
3. Select PostgreSQL 14+
4. **DB Instance Class**: `db.t3.micro` (Free tier eligible)
5. **Storage**: 20 GB (free tier)
6. **DB Name**: `irongate` (important - matches our schema)
7. **Master username**: `adminuser`
8. **Master password**: Generate a strong password (save this!)
9. **VPC Security Group**: Create/select one allowing inbound PostgreSQL (port 5432)
10. Click "Create database"

### 1.2 Wait for Database Creation (~5-10 minutes)

Once status is "Available", note the endpoint:
```
prod-db.xxxxx.rds.amazonaws.com
```

### 1.3 Connect and Run Migration

From your local machine:

```bash
# Install PostgreSQL client if needed (Mac/Linux)
brew install postgresql

# Connect to remote database
psql -h prod-db.xxxxx.rds.amazonaws.com -U adminuser -d postgres

# In psql shell, create irongate database:
CREATE DATABASE irongate;
\q

# Run the schema migration
psql -h prod-db.xxxxx.rds.amazonaws.com -U adminuser -d irongate < database.sql
```

---

## Step 2: Set Up EC2 Instance

### 2.1 Launch EC2 Instance

1. Go to AWS Console → EC2 → Instances
2. Click "Launch instances"
3. **AMI**: Choose "Amazon Linux 2" (free tier eligible)
4. **Instance Type**: `t3.micro` (free tier)
5. **Key Pair**: Create new → save `.pem` file securely
6. **Security Group**: Allow inbound:
   - Port 22 (SSH) - from your IP only
   - Port 80 (HTTP) - from anywhere
   - Port 443 (HTTPS) - from anywhere
   - Port 4000 (Backend API) - optional, only if direct access needed
7. Click "Launch"

### 2.2 Connect to EC2

```bash
# Make key file readable
chmod 400 your-key-pair.pem

# SSH into instance
ssh -i your-key-pair.pem ec2-user@your-instance-ip
```

### 2.3 Install Dependencies on EC2

```bash
# Update system
sudo yum update -y

# Install Node.js 18
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install PM2 (process manager)
sudo npm install -g pm2

# Install Nginx (reverse proxy)
sudo yum install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Install PostgreSQL client
sudo yum install -y postgresql14-contrib
```

### 2.4 Create Application Directory

```bash
# Create app directory
mkdir -p ~/irongate
cd ~/irongate

# Initialize Node project
npm init -y

# Install production dependencies
npm install express cors body-parser jsonwebtoken dotenv
```

---

## Step 3: Deploy Backend API

### 3.1 Create Environment File

Create `.env` on EC2:

```bash
cat > ~/.env << 'EOF'
NODE_ENV=production
API_PORT=4000
DATABASE_URL=postgresql://adminuser:YOUR_PASSWORD@prod-db.xxxxx.rds.amazonaws.com:5432/irongate
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
LOG_LEVEL=info
CORS_ORIGIN=https://yourdomain.com
EOF
```

### 3.2 Upload Backend Files

From your local machine:

```bash
# Copy backend files to EC2
scp -i your-key-pair.pem backend.js ec2-user@your-instance-ip:~/irongate/
scp -i your-key-pair.pem backend-auth-endpoints.js ec2-user@your-instance-ip:~/irongate/
scp -i your-key-pair.pem package.json ec2-user@your-instance-ip:~/irongate/
```

### 3.3 Start Backend with PM2

On EC2:

```bash
cd ~/irongate

# Install dependencies
npm install

# Start with PM2
pm2 start backend.js --name "irongate-api"

# Configure PM2 to auto-start on reboot
pm2 startup
pm2 save

# View logs
pm2 logs irongate-api
```

---

## Step 4: Deploy Frontend (React)

### 4.1 Build React App Locally

From your development machine:

```bash
# Build production bundle
npm run build

# This creates dist/ folder
```

### 4.2 Upload to EC2

```bash
scp -i your-key-pair.pem -r dist ec2-user@your-instance-ip:~/irongate/frontend
```

### 4.3 Configure Nginx as Reverse Proxy

On EC2, create Nginx config:

```bash
sudo tee /etc/nginx/conf.d/irongate.conf > /dev/null << 'EOF'
upstream backend {
    server localhost:4000;
}

server {
    listen 80;
    server_name your-domain.com;
    
    # Redirect HTTP to HTTPS (after SSL setup)
    # return 301 https://$server_name$request_uri;

    # Serve frontend
    location / {
        root /home/ec2-user/irongate/frontend;
        try_files $uri /index.html;
    }

    # Proxy API requests to backend
    location /v1 {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Restart Nginx
sudo systemctl restart nginx
```

---

## Step 5: Set Up Domain & SSL

### 5.1 Register Domain

1. Use Route 53 or external registrar (GoDaddy, Namecheap, etc.)
2. Point nameservers to Route 53 or create A record pointing to EC2 Elastic IP

### 5.2 Create Elastic IP (Optional but Recommended)

```bash
# On AWS Console: EC2 → Elastic IPs → Allocate
# Associate with your EC2 instance
```

### 5.3 Add SSL Certificate (Let's Encrypt)

On EC2:

```bash
# Install Certbot
sudo yum install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot certonly --nginx -d your-domain.com

# Auto-renew
sudo systemctl enable certbot.timer
```

### 5.4 Update Nginx for HTTPS

```bash
sudo tee /etc/nginx/conf.d/irongate.conf > /dev/null << 'EOF'
upstream backend {
    server localhost:4000;
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        root /home/ec2-user/irongate/frontend;
        try_files $uri /index.html;
    }

    location /v1 {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

sudo systemctl restart nginx
```

---

## Step 6: Update Frontend Environment

In your frontend `src/` directory, create `.env.production`:

```
VITE_API_URL=https://your-domain.com/v1
```

Rebuild and redeploy:

```bash
npm run build
scp -i your-key-pair.pem -r dist ec2-user@your-instance-ip:~/irongate/frontend
```

---

## Step 7: Monitoring & Logs

### View Application Logs

```bash
# Backend logs
pm2 logs irongate-api

# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Nginx error logs
sudo tail -f /var/log/nginx/error.log
```

### Set Up CloudWatch Monitoring (Optional)

1. AWS Console → CloudWatch → Dashboards
2. Create dashboard tracking:
   - RDS CPU, Storage, Connections
   - EC2 CPU, Network
   - Application errors

### Cost Monitoring

```bash
# View AWS billing
AWS Console → Billing & Cost Management
```

---

## Step 8: Database Backups

### Automated RDS Backups

1. AWS Console → RDS → Databases → Your DB
2. Modify → Backup Retention Period: 7 days

### Manual Snapshot

```bash
aws rds create-db-snapshot \
  --db-instance-identifier irongate-db \
  --db-snapshot-identifier irongate-backup-$(date +%Y%m%d)
```

---

## Troubleshooting

### Backend Won't Start

```bash
# Check PM2 logs
pm2 logs irongate-api

# Verify database connection
psql -h prod-db.xxxxx.rds.amazonaws.com -U adminuser -d irongate
```

### Frontend Shows 502 Bad Gateway

```bash
# Check Nginx config
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### Database Connection Issues

```bash
# Test connection from EC2
psql -h prod-db.xxxxx.rds.amazonaws.com -U adminuser -d irongate -c "SELECT 1"

# Check security group allows port 5432 from EC2
```

### SSL Certificate Won't Renew

```bash
# Manually renew
sudo certbot renew --force-renewal

# Check logs
sudo tail -f /var/log/letsencrypt/letsencrypt.log
```

---

## Production Checklist

- [ ] Database is encrypted (RDS encryption enabled)
- [ ] EC2 security groups restricted (SSH only from your IP)
- [ ] HTTPS enabled via Let's Encrypt
- [ ] JWT_SECRET is strong and unique
- [ ] Database backups configured
- [ ] Monitoring/alerts set up
- [ ] Environment variables (.env) are production values
- [ ] NODE_ENV=production
- [ ] Frontend environment optimized (gzip enabled in Nginx)
- [ ] Test all login flows with each role

---

## Performance Optimization

### Enable Gzip in Nginx

```bash
sudo tee -a /etc/nginx/nginx.conf >> <<EOF
gzip on;
gzip_types text/plain text/css application/json application/javascript;
gzip_min_length 1000;
EOF

sudo systemctl restart nginx
```

### Database Connection Pooling

Update backend Node.js to use `pg-pool`:

```bash
npm install pg pg-pool
```

### CloudFront CDN (Optional)

1. AWS Console → CloudFront → Create distribution
2. Origin: S3 bucket with frontend assets OR ALB
3. Enable caching for `/v1` paths with cache busting

---

## Cost Estimate (Monthly)

| Service | Size | Cost |
|---------|------|------|
| RDS PostgreSQL | t3.micro | $15-20 |
| EC2 | t3.micro (1 year free) | $10-15 |
| Nginx + Frontend | - | $1-2 |
| Data transfer | ~1 GB | $0.85 |
| **Total** | | **$27-38** |

(Prices vary by region; estimates are for us-east-1)

---

## Next Steps

1. Test login with all user roles
2. Load test API with Apache Bench: `ab -n 100 -c 10 https://your-domain.com/v1/dashboard`
3. Set up monitoring alerts
4. Plan disaster recovery procedures
5. Document runbooks for common issues

---

## Support

For AWS support:
- AWS Documentation: https://docs.aws.amazon.com
- AWS Support Plans: https://aws.amazon.com/premiumsupport/

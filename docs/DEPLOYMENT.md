# AudioRepurpose - Docker Deployment Guide

This guide will help you deploy AudioRepurpose to your Ubuntu server using Docker.

## Prerequisites

On your Ubuntu server, ensure you have:
- Docker (20.10+)
- Docker Compose (2.0+)
- At least 4GB RAM
- 20GB free disk space

### Install Docker on Ubuntu

```bash
# Update package list
sudo apt update

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group (to run without sudo)
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

Log out and back in for group changes to take effect.

## Deployment Steps

### 1. Clone the Repository

```bash
cd /var/www  # or your preferred directory
git clone https://github.com/lucasfini/audiorepurpose.git
cd audiorepurpose
```

### 2. Configure Environment Variables

Create a `.env` file from the example:

```bash
cp .env.example .env
nano .env  # or use your preferred editor
```

**Required environment variables:**

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AI Services
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
HUGGING_FACE_ACCESS_TOKEN=hf_...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App Config
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

See `.env.example` for all available options.

### 3. Build and Start the Application

```bash
# Build the Docker image (first time)
docker compose build

# Start the application
docker compose up -d

# View logs
docker compose logs -f
```

The application will be available at `http://localhost:3000`

### 4. Set Up Nginx Reverse Proxy (Recommended)

Install Nginx:

```bash
sudo apt install nginx certbot python3-certbot-nginx
```

Create Nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/audiorepurpose
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    client_max_body_size 100M;  # Allow large audio file uploads

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Increase timeouts for long-running AI requests
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/audiorepurpose /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 5. Set Up SSL with Let's Encrypt

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Follow the prompts. Certbot will automatically configure SSL and set up auto-renewal.

## Management Commands

### View Logs

```bash
# All logs
docker compose logs -f

# Last 100 lines
docker compose logs --tail=100

# Specific service logs
docker compose logs -f audiorepurpose
```

### Restart the Application

```bash
docker compose restart
```

### Stop the Application

```bash
docker compose down
```

### Rebuild After Code Changes

```bash
# Pull latest code
git pull

# Rebuild and restart
docker compose up -d --build
```

### Update Environment Variables

```bash
# Edit .env file
nano .env

# Restart to apply changes
docker compose restart
```

## Resource Management

### Check Container Status

```bash
docker compose ps
docker stats
```

### Adjust Resource Limits

Edit `docker-compose.yml` to change CPU and memory limits:

```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 4G
```

Then restart:

```bash
docker compose up -d --force-recreate
```

## Backup and Restore

### Backup Logs

```bash
# Logs are stored in ./logs directory
tar -czf audiorepurpose-logs-$(date +%Y%m%d).tar.gz logs/
```

### Database Backup

Your data is in Supabase (cloud), so no local database backup is needed. However, you should:

1. Set up automated Supabase backups in your project settings
2. Export important data periodically

## Troubleshooting

### Container Won't Start

```bash
# Check logs for errors
docker compose logs

# Verify environment variables
docker compose config

# Check disk space
df -h
```

### Out of Memory

```bash
# Check container memory usage
docker stats

# Increase memory limits in docker-compose.yml
# Or add swap space to your server
```

### Python Dependencies Failing

The Dockerfile installs PyTorch (CPU version) and PyAnnote automatically. If build fails:

```bash
# Clear build cache and rebuild
docker compose build --no-cache
```

### Port Already in Use

```bash
# Check what's using port 3000
sudo lsof -i :3000

# Either stop that service or change the port in docker-compose.yml:
ports:
  - "8080:3000"  # Use port 8080 instead
```

### File Upload Issues

Large audio files may timeout. Increase nginx timeouts:

```nginx
# In nginx config
client_max_body_size 100M;
proxy_connect_timeout 600;
proxy_send_timeout 600;
proxy_read_timeout 600;
```

## Monitoring

### Health Checks

The application includes a health check endpoint:

```bash
curl http://localhost:3000/api/health
```

### Set Up Uptime Monitoring

Use services like:
- UptimeRobot (free)
- Pingdom
- StatusCake

Monitor: `https://yourdomain.com/api/health`

## Security Best Practices

1. **Never commit `.env` file** - It contains secrets
2. **Use strong secrets** for Stripe webhook secret
3. **Keep Docker updated**: `sudo apt update && sudo apt upgrade`
4. **Use SSL/HTTPS** in production (Let's Encrypt)
5. **Firewall**: Only expose ports 80, 443 (and 22 for SSH)

```bash
# Set up UFW firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Updates and Maintenance

### Update the Application

```bash
cd /var/www/audiorepurpose
git pull
docker compose up -d --build
```

### Update Docker Images

```bash
# Pull latest base images
docker compose pull

# Rebuild
docker compose up -d --build
```

### Clean Up Disk Space

```bash
# Remove unused Docker resources
docker system prune -a

# Remove old logs
find logs/ -name "*.json" -mtime +30 -delete
```

## Performance Optimization

### Enable Docker BuildKit

Add to `/etc/docker/daemon.json`:

```json
{
  "features": {
    "buildkit": true
  }
}
```

Restart Docker:

```bash
sudo systemctl restart docker
```

### Use Docker Volumes for Faster I/O

Already configured in `docker-compose.yml`:

```yaml
volumes:
  - ./logs:/app/logs
  - ./uploads:/app/uploads
```

## Support

If you encounter issues:

1. Check logs: `docker compose logs -f`
2. Verify environment variables: `docker compose config`
3. Check GitHub issues: https://github.com/lucasfini/audiorepurpose/issues
4. Review this guide's troubleshooting section

## Production Checklist

- [ ] Domain configured and DNS pointing to server
- [ ] SSL certificate installed (Let's Encrypt)
- [ ] All environment variables set in `.env`
- [ ] Nginx reverse proxy configured
- [ ] Firewall configured (UFW)
- [ ] Backups configured (Supabase + logs)
- [ ] Monitoring/uptime checks set up
- [ ] Resource limits appropriate for your server
- [ ] Stripe webhook configured with production secret
- [ ] API keys are production keys (not test keys)

---

**Your application is now running in Docker on Ubuntu!** 🎉

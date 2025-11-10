# 🚀 Deployment Guide

## Railway Deployment

This project is configured for Railway deployment with the following files:
- `railway.json` - Railway configuration
- `nixpacks.toml` - Build configuration
- `Procfile` - Process definition

### Prerequisites

1. **MongoDB Database**: Set up a MongoDB database (MongoDB Atlas recommended)
2. **Environment Variables**: Configure the following in Railway:

```env
# Backend Environment Variables
NODE_ENV=production
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_secure_jwt_secret

# Shopify API (Optional)
SHOPIFY_ACCESS_TOKEN=your_token
SHOPIFY_SHOP_DOMAIN=your-store.myshopify.com
SHOPIFY_API_VERSION=2024-01
```

### Deployment Steps

1. **Connect Repository to Railway**
   - Go to https://railway.app
   - Click "New Project" → "Deploy from GitHub repo"
   - Select `voyageeyewear/POS-system-final-nov-2025`

2. **Configure Environment Variables**
   - Go to project settings
   - Add all required environment variables

3. **Deploy**
   - Railway will automatically build and deploy
   - Backend will run on the assigned Railway domain

### Separate Frontend Deployment

For better performance, deploy frontend separately on Vercel:

1. **Deploy to Vercel**
   - Go to https://vercel.com
   - Import GitHub repository
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `.next`

2. **Environment Variables (Vercel)**
   ```env
   NEXT_PUBLIC_API_URL=https://your-backend-railway-url.railway.app/api
   ```

### Post-Deployment

1. **Seed Database**: Run seed command via Railway console
   ```bash
   cd backend && npm run seed
   ```

2. **Test the Application**
   - Backend API: `https://your-app.railway.app`
   - Admin Login: `admin@pos.com` / `admin123`

---

## Alternative: Docker Deployment

See `docker-compose.yml` for containerized deployment.

## Support

For issues, check the logs in Railway dashboard or contact support.


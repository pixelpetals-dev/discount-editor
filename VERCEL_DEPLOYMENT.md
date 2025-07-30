# Vercel Deployment Guide for Shopify App

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **PostgreSQL Database**: You'll need a cloud PostgreSQL database (recommended options below)
3. **Shopify Partner Account**: For app configuration

## Database Setup

### Option 1: Vercel Postgres (Recommended)
1. Go to your Vercel dashboard
2. Create a new Postgres database
3. Copy the connection string

### Option 2: Supabase (Free tier available)
1. Sign up at [supabase.com](https://supabase.com)
2. Create a new project
3. Go to Settings > Database
4. Copy the connection string

### Option 3: PlanetScale
1. Sign up at [planetscale.com](https://planetscale.com)
2. Create a new database
3. Copy the connection string

## Environment Variables

You'll need to set these environment variables in Vercel:

### Required Variables
```
DATABASE_URL=your_postgres_connection_string
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SCOPES=read_customers,write_draft_orders,write_products
SHOPIFY_APP_URL=https://your-vercel-app.vercel.app
```

### Optional Variables (for development)
```
NODE_ENV=production
```

### How to Get Shopify Credentials
1. Go to your Shopify Partner dashboard
2. Navigate to Apps > Your App
3. Copy the API key and secret
4. Update the app URL to your Vercel domain

## Deployment Steps

### 1. Push to GitHub
```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

### 2. Deploy to Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. Configure environment variables
5. Deploy

**Note**: The build process will automatically:
- Generate the Prisma client
- Build the Remix application
- Set up the serverless functions

### 3. Update Shopify App Configuration
1. Go to your Shopify Partner dashboard
2. Update your app's URLs:
   - App URL: `https://your-vercel-app.vercel.app`
   - Allowed redirection URLs: 
     - `https://your-vercel-app.vercel.app/auth/callback`
     - `https://your-vercel-app.vercel.app/auth/shopify/callback`
     - `https://your-vercel-app.vercel.app/api/auth/callback`

## Post-Deployment

### 1. Test the App
1. Install the app on your development store
2. Test all functionality
3. Verify database connections

### 2. Monitor Logs
- Check Vercel function logs for any errors
- Monitor database connections
- Verify Shopify webhooks are working

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Verify DATABASE_URL is correct
   - Check if database is accessible from Vercel
   - Ensure SSL is enabled for production

2. **Build Failures**
   - Check if all dependencies are installed
   - Verify Prisma client generation
   - Check migration status

3. **Shopify Authentication Issues**
   - Verify API keys are correct
   - Check redirect URLs match exactly
   - Ensure app is properly configured in Partner dashboard

### Support
- Vercel Documentation: [vercel.com/docs](https://vercel.com/docs)
- Shopify App Development: [shopify.dev](https://shopify.dev)
- Prisma Documentation: [prisma.io/docs](https://prisma.io/docs)

## Security Notes

1. **Environment Variables**: Never commit sensitive data to your repository
2. **Database**: Use connection pooling for production
3. **Shopify Tokens**: Rotate API keys regularly
4. **Webhooks**: Verify webhook signatures

## Performance Optimization

1. **Database**: Use connection pooling
2. **Caching**: Implement Redis for session storage
3. **CDN**: Vercel automatically provides global CDN
4. **Functions**: Optimize cold start times 
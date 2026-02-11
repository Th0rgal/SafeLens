# SafeLens Deployment Guide

## Quick Deploy to Vercel (Recommended)

1. Push your code to GitHub (already done ✅)

2. Visit [vercel.com](https://vercel.com) and sign in

3. Click "New Project"

4. Import the `Th0rgal/SafeLens` repository

5. Configure:
   - Framework Preset: **Next.js**
   - Build Command: `npm run build` (default)
   - Output Directory: `.next` (default)
   - Install Command: `npm install` (default)

6. Click "Deploy"

That's it! Your app will be live at `https://safelens.vercel.app` (or similar)

## Environment Variables

No environment variables required for the MVP! The app is completely client-side and uses public Safe Transaction Service APIs.

## Manual Deployment

### Build for Production

```bash
npm run build
```

This creates an optimized production build in `.next/`.

### Start Production Server

```bash
npm start
```

The app will run on http://localhost:3000

### Docker Deployment (Optional)

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t safelens .
docker run -p 3000:3000 safelens
```

## Static Export (Optional)

For fully static deployment to Netlify, GitHub Pages, etc.:

1. Update `next.config.js`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
}

module.exports = nextConfig
```

2. Build:
```bash
npm run build
```

3. Deploy the `out/` directory to any static host

⚠️ **Note**: This removes the redirect in the home page, so you'll need to handle routing differently.

## Performance Optimizations

The current build is already optimized:

- ✅ Server Components for initial load
- ✅ Code splitting by route
- ✅ Minimal bundle sizes (~111-118 kB per page)
- ✅ No external API calls on server (all client-side)

## Monitoring

Since the app is stateless and client-side, you don't need backend monitoring. Consider:

- Vercel Analytics (free with Vercel deployment)
- Sentry for error tracking (optional)
- Web Vitals monitoring

## Security Considerations

- ✅ No API keys needed (uses public APIs)
- ✅ No server-side secrets
- ✅ All validation client-side
- ✅ No user data stored

## Scaling

The app is stateless and highly cacheable:

- CDN distribution works perfectly
- No database or backend needed
- Scales horizontally by default
- Safe API rate limits are the only bottleneck (handled client-side)

## Custom Domain

On Vercel:
1. Go to Project Settings → Domains
2. Add your custom domain
3. Configure DNS as instructed

That's it!

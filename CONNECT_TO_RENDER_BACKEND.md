# Connect Frontend to Render Backend

## Quick Setup

### Step 1: Create Environment File

Create a file named `.env.local` in the `frontend/` folder with:

```env
VITE_API_URL=https://stocktake-backend2.onrender.com
```

### Step 2: Restart Frontend Dev Server

Stop your frontend server (Ctrl+C) and restart it:

```bash
cd frontend
npm run dev
```

### Step 3: Test Connection

Your frontend at `http://localhost:3000` will now connect to:
- `https://stocktake-backend2.onrender.com/api`

## Switch Back to Local Backend

To use local backend instead, either:

1. **Delete or comment out** the line in `.env.local`:
   ```env
   # VITE_API_URL=https://stocktake-backend2.onrender.com
   ```

2. **Or change it to:**
   ```env
   VITE_API_URL=http://localhost:8000
   ```

3. **Restart the frontend dev server**

## How It Works

- The frontend checks for `VITE_API_URL` environment variable
- If set, it uses that URL + `/api` for all API calls
- If not set, it uses `/api` which goes through Vite proxy to `localhost:8000`

## CORS Configuration

The backend on Render already has CORS enabled, so your local frontend can make requests to it without issues.

## Troubleshooting

**If you get CORS errors:**
- Make sure your Render backend has CORS enabled (it should already)
- Check that the backend URL is correct in `.env.local`

**If API calls fail:**
- Verify the backend is running on Render (check the URL)
- Check browser console for error messages
- Verify `.env.local` file is in the `frontend/` folder
- Restart the dev server after creating/updating `.env.local`

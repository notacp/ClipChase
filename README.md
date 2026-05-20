# ClipChase

**Ctrl+F for YouTube** — Search inside video transcripts with clickable timestamps.

ClipChase lets you search across any YouTube channel for specific keywords or phrases and returns videos with clickable timestamps where those words were spoken.

## Features

- **Channel-Wide Search**: Search across all public videos from any YouTube channel
- **Hybrid Indexed Search**: Reuse a local SQLite/FTS transcript index when available, then fall back to live transcript fetches for uncached videos
- **Keyword Matching**: Locate where any keyword or phrase is actually said
- **Clickable Timestamps**: Jump directly to the moment in the video
- **Time Range Filtering**: Filter by last 7 days, 30 days, 6 months, 1 year, or all time
- **Video Preview**: Embedded player with timestamp synchronization
- **Context Display**: See surrounding text for each match

## Tech Stack

**Frontend**
- Next.js 16 with App Router
- React 19, TypeScript
- Tailwind CSS, Framer Motion

**Backend**
- FastAPI (Python)
- SQLite FTS transcript index
- YouTube Data API v3
- youtube-transcript-api

**Deployment**
- Vercel (serverless functions)

## Project Structure

```
ClipChase/
├── src/
│   ├── app/           # Next.js pages and layout
│   ├── components/    # React components
│   ├── lib/           # Utilities
│   └── types/         # TypeScript interfaces
├── api/
│   ├── app/
│   │   ├── main.py    # FastAPI app
│   │   ├── routers/   # API endpoints
│   │   └── services/  # YouTube service
│   └── index.py       # Vercel entry point
├── next.config.ts
├── vercel.json
└── requirements.txt
```

## Setup

### Prerequisites

- Python 3.8+
- Node.js 18+
- YouTube Data API key ([Google Cloud Console](https://console.cloud.google.com/))

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/clipchase.git
cd clipchase

# Backend setup
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Frontend setup
npm install
```

### Environment Variables

Create a `.env` file in the root directory:

```env
YT_API_KEY=your_youtube_api_key

# Optional: override the local transcript index location
CLIPCHASE_DB_PATH=/absolute/path/to/clipchase_index.sqlite3
```

By default, the hybrid transcript index is stored at `.data/clipchase_index.sqlite3`.

### Running Locally

```bash
# Terminal 1: Start backend
uvicorn api.app.main:app --reload --port 8000

# Terminal 2: Start frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deployment

Configured for Vercel:

1. Push to GitHub
2. Connect repository to Vercel
3. Add `YT_API_KEY` in Vercel environment variables
4. Deploy

Note: the transcript index uses SQLite on disk. For persistent production indexing, point `CLIPCHASE_DB_PATH` at mounted persistent storage.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/search` | GET | Search indexed transcripts first, then fall back to live transcript fetches for uncached videos |
| `/api/index/channel` | POST | Build or refresh the local transcript index for a channel |
| `/api/resolve-channel` | GET | Resolve channel URL to ID |

**Search Parameters:**
- `channel_url` - YouTube channel URL or handle
- `keyword` - Search term
- `max_videos` - Limit (default: 20)
- `published_after` - ISO date filter (optional)

## License

MIT

---

Built by [Pradyumn Khanchandani](https://www.linkedin.com/in/pradyumn-khanchandani/)

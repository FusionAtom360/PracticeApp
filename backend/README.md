# PracticeApp Backend

A small Node.js API that stores song data in `data/songs.json` and serves it over HTTP.

## Run

```bash
cd backend
npm start
```

The server listens on `http://localhost:3001` by default.

## Endpoints

- `GET /health` - health check
- `GET /songs` - list all songs
- `GET /songs/:id` - fetch one song by id
- `POST /songs` - create a song

## Create Song Body

```json
{
  "title": "Song Title",
  "artist": "Artist Name",
  "album": "Optional Album",
  "year": 2026
}
```

`title` and `artist` are required.

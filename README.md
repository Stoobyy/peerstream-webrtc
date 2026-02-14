# PeerStream

Private screening room for streaming videos and movies with friends without any hitch.

Live now at https://stooby.in/peerstream/

## Features

- Peer-to-peer streaming
- Supports subtitles (.vtt, .srt)
- Real-time synchronization
- Theater support

## Usage

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open your browser to `http://localhost:4000`.

## Host Bandwidth Requirements

As a P2P host, you stream video directly to each guest. Ensure you have sufficient **upload speed**.

| Guests | Required Upload Speed |
|--------|----------------------|
| 2      | ~5 Mbps              |
| 4      | ~10 Mbps             |
| 6+     | ~15+ Mbps            |

> **Note**: 1080p movies are streamed at 720p to reduce lag and improve performance.

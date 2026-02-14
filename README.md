# PeerStream

Private screening room for streaming videos and movies with friends without any hitch.

Live now at https://stooby.in/peerstream/

## Features

- Peer-to-peer streaming
- Supports subtitles (.vtt, .srt)
- Real-time synchronization
- Theater support
- Remembers timestamps (continue watching where you left off)

## How It Works

1.  **Host**: The host selects a video file. The browser captures the video stream using `captureStream()`.
2.  **Signaling**: The host and guests exchange connection details (ICE candidates, SDP) via the Socket.IO server.
3.  **P2P Connection**: A direct WebRTC connection is established between the host and each guest.
4.  **Streaming**: The video and audio are streamed directly from the host's browser to the guests.
5.  **Sync**: The host sends time updates to keep everyone in sync.

## Host Bandwidth Requirements

As a P2P host, you stream video directly to each guest. Ensure you have sufficient **upload speed**.

| Guests | Required Upload Speed |
|--------|----------------------|
| 2      | ~5 Mbps              |
| 4      | ~10 Mbps             |
| 6+     | ~15+ Mbps            |

> **Note**: 1080p movies are streamed at 720p to reduce lag and improve performance.

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


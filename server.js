const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const xss = require('xss');

const app = express();

// Security Headers (disable CSP to avoid breaking inline scripts/styles for now)
app.use(helmet({ contentSecurityPolicy: false }));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    maxHttpBufferSize: 10e6,
    path: '/peerstream/socket.io'
});

const PORT = process.env.PORT || 4000;
app.use('/peerstream', express.static(path.join(__dirname, 'public')));

const rooms = new Map();

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('create_room', ({ username }) => {
        // Sanitize username
        const safeUsername = xss(username);
        const roomCode = generateRoomCode();
        const room = {
            host: socket.id,
            subtitleData: null, subtitleName: null,
            users: new Map(),
            isPlaying: false, currentTime: 0, lastSyncTime: Date.now()
        };
        room.users.set(socket.id, { id: socket.id, username: safeUsername || 'Host', isHost: true, isReady: false });
        rooms.set(roomCode, room);
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.emit('room_created', { roomCode, users: Array.from(room.users.values()) });
        console.log(`Room created: ${roomCode} by ${safeUsername}`);
    });

    socket.on('join_room', ({ roomCode, username }) => {
        const safeUsername = xss(username);
        // Basic validation for roomCode to prevent potential abuse (alphanumeric check)
        if (!/^[A-Z0-9]+$/i.test(roomCode)) {
            socket.emit('error', { message: 'Invalid Room Code' }); return;
        }

        const room = rooms.get(roomCode);
        if (!room) { socket.emit('error', { message: 'Room not found' }); return; }
        room.users.set(socket.id, { id: socket.id, username: safeUsername || `User ${room.users.size + 1}`, isHost: false, isReady: false });
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.emit('room_joined', {
            roomCode,
            subtitleData: room.subtitleData, subtitleName: room.subtitleName,
            users: Array.from(room.users.values()),
            isPlaying: room.isPlaying, currentTime: room.currentTime
        });
        io.to(roomCode).emit('user_list_update', { users: Array.from(room.users.values()) });
        // Tell the host about the new peer so it can create an offer
        io.to(room.host).emit('peer_joined', { peerId: socket.id, username: safeUsername || `User ${room.users.size}` });
        console.log(`${safeUsername} joined room: ${roomCode}`);
    });

    // Host requests list of existing peers (for when video is loaded after peers join)
    socket.on('request_peer_list', () => {
        const room = rooms.get(socket.roomCode);
        if (room && room.host === socket.id) {
            room.users.forEach((user, id) => {
                if (id !== socket.id) {
                    socket.emit('peer_joined', { peerId: id, username: user.username });
                }
            });
        }
    });

    // --- WebRTC Signaling ---
    socket.on('webrtc_offer', ({ targetId, offer }) => {
        io.to(targetId).emit('webrtc_offer', { senderId: socket.id, offer });
    });

    socket.on('webrtc_answer', ({ targetId, answer }) => {
        io.to(targetId).emit('webrtc_answer', { senderId: socket.id, answer });
    });

    socket.on('ice_candidate', ({ targetId, candidate }) => {
        io.to(targetId).emit('ice_candidate', { senderId: socket.id, candidate });
    });

    // --- Subtitles ---
    socket.on('share_subtitle', ({ subtitleData, subtitleName }) => {
        const room = rooms.get(socket.roomCode);
        if (room && room.host === socket.id) {
            room.subtitleData = subtitleData;
            room.subtitleName = subtitleName;
            socket.to(socket.roomCode).emit('subtitle_received', { subtitleData, subtitleName });
            console.log(`Subtitle "${subtitleName}" shared`);
        }
    });

    // Host broadcasts active subtitle text in real-time
    socket.on('subtitle_text', ({ text }) => {
        const room = rooms.get(socket.roomCode);
        if (room && room.host === socket.id) {
            socket.to(socket.roomCode).emit('subtitle_text', { text });
        }
    });

    // --- Sync Controls ---
    socket.on('client_ready', () => {
        const room = rooms.get(socket.roomCode);
        if (room && room.users.has(socket.id)) {
            const user = room.users.get(socket.id);
            user.isReady = true;
            const allReady = Array.from(room.users.values()).every(u => u.isReady);
            io.to(socket.roomCode).emit('user_list_update', { users: Array.from(room.users.values()) });
            io.to(socket.roomCode).emit('ready_status', { allReady });
        }
    });

    socket.on('play', ({ currentTime }) => {
        const room = rooms.get(socket.roomCode);
        if (room && room.host === socket.id) {
            room.isPlaying = true; room.currentTime = currentTime; room.lastSyncTime = Date.now();
            io.to(socket.roomCode).emit('sync_play', { currentTime, serverTimestamp: Date.now() });
        }
    });

    socket.on('pause', ({ currentTime }) => {
        const room = rooms.get(socket.roomCode);
        if (room && room.host === socket.id) {
            room.isPlaying = false; room.currentTime = currentTime; room.lastSyncTime = Date.now();
            io.to(socket.roomCode).emit('sync_pause', { currentTime, serverTimestamp: Date.now() });
        }
    });

    socket.on('seek', ({ currentTime }) => {
        const room = rooms.get(socket.roomCode);
        if (room && room.host === socket.id) {
            room.currentTime = currentTime; room.lastSyncTime = Date.now();
            socket.to(socket.roomCode).emit('sync_seek', { currentTime, serverTimestamp: Date.now() });
        }
    });

    socket.on('host_time_update', ({ currentTime }) => {
        const room = rooms.get(socket.roomCode);
        if (room && room.host === socket.id && room.isPlaying) {
            room.currentTime = currentTime; room.lastSyncTime = Date.now();
            socket.to(socket.roomCode).emit('time_check', { currentTime, serverTimestamp: Date.now() });
        }
    });

    // Guest requests skip — forward to host
    socket.on('skip', ({ offset }) => {
        const room = rooms.get(socket.roomCode);
        if (room && room.host !== socket.id) {
            io.to(room.host).emit('skip_request', { offset, from: socket.id });
        }
    });

    socket.on('disconnect', () => {
        const room = rooms.get(socket.roomCode);
        if (room) {
            room.users.delete(socket.id);
            if (socket.id === room.host) {
                io.to(socket.roomCode).emit('room_closed', { message: 'Host has left the party' });
                rooms.delete(socket.roomCode);
            } else {
                io.to(socket.roomCode).emit('user_list_update', { users: Array.from(room.users.values()) });
                io.to(socket.roomCode).emit('peer_disconnected', { peerId: socket.id });
                const allReady = Array.from(room.users.values()).every(u => u.isReady);
                io.to(socket.roomCode).emit('ready_status', { allReady });
            }
        }
    });
});

server.listen(PORT, () => console.log(`🎬 PeerStream WebRTC running at http://localhost:${PORT}`));

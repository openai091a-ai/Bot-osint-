const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 });

app.use(express.json({ limit: '100mb' }));
app.use(cors());

const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI;

const User = mongoose.model('User', new mongoose.Schema({
    name: String, username: { type: String, unique: true },
    password: { type: String }, socketId: String, avatarColor: String, isGold: { type: Boolean, default: true },
    sessions: { type: Array, default: [] },
    settings: { hideData: { type: Boolean, default: false }, notifications: { type: Boolean, default: true }, ringtone: { type: String, default: 'default' } }
}));

const Chat = mongoose.model('Chat', new mongoose.Schema({
    title: String, username: { type: String, unique: true }, type: String,
    owner: String, admins: [String], members: [String], mutes: [String], pinnedMessage: Object
}));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/api/ping', (req, res) => res.send('ok'));

server.listen(PORT, '0.0.0.0', () => {
    if (MONGO_URI) {
        mongoose.connect(MONGO_URI).catch(()=>{});
    }
});

app.post('/api/register', async (req, res) => {
    const { name, username, password } = req.body;
    try {
        let user = await User.findOne({ username });
        if (user) return res.status(400).send("User exists");
        user = new User({ name, username, password, avatarColor: '#'+Math.floor(Math.random()*16777215).toString(16) });
        await user.save();
        res.json({ success: true, user });
    } catch (e) { 
        res.status(500).send("Error"); 
    }
});

app.post('/api/login', async (req, res) => {
    const { login, password } = req.body;
    try {
        const user = await User.findOne({ username: login, password });
        if (user) {
            res.json({ success: true, user });
        } else res.status(401).send("Error");
    } catch(e) { 
        res.status(500).send("Error"); 
    }
});

app.post('/api/chat/create', async (req, res) => {
    const { title, username, type, owner } = req.body;
    try {
        const chat = new Chat({ title, username: '@' + username.replace('@',''), type, owner, admins: [owner], members: [owner] });
        await chat.save();
        res.json(chat);
    } catch (e) { res.status(500).send("Busy"); }
});

app.get('/api/search', async (req, res) => {
    try {
        const q = req.query.q;
        const users = await User.find({ username: { $regex: q, $options: 'i' } }).limit(5);
        const chats = await Chat.find({ username: { $regex: q, $options: 'i' } }).limit(5);
        res.json({ users, chats });
    } catch(e) { res.json({ users: [], chats: [] }); }
});

app.post('/api/user/update', async (req, res) => {
    try {
        const user = await User.findOneAndUpdate({ username: req.body.username }, { settings: req.body.settings }, { new: true });
        res.json(user);
    } catch (e) { res.status(500).send("Error"); }
});

app.post('/api/user/buy-gold', async (req, res) => {
    try {
        const user = await User.findOneAndUpdate({ username: req.body.username }, { isGold: true }, { new: true });
        res.json(user);
    } catch (e) { res.status(500).send("Error"); }
});

app.post('/api/sessions', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.body.username });
        res.json(user ? user.sessions : []);
    } catch(e) { res.json([]); }
});

app.post('/api/sessions/terminate', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.body.username });
        if (user) {
            const target = user.sessions.find(s => s.deviceId === req.body.deviceId);
            if (target && target.socketId) {
                io.to(target.socketId).emit('force_logout');
            }
            user.sessions = user.sessions.filter(s => s.deviceId !== req.body.deviceId);
            await user.save();
            res.json({ success: true });
        }
    } catch(e) { res.status(500).send("Error"); }
});

io.on('connection', (socket) => {
    socket.on('identify', async (d) => { 
        try { 
            let u = typeof d === 'string' ? d : d.username;
            let deviceId = typeof d === 'object' ? d.deviceId : 'unknown';
            let deviceName = typeof d === 'object' ? d.deviceName : 'Unknown';

            const user = await User.findOne({ username: u });
            if(user) {
                user.socketId = socket.id;
                let sIdx = user.sessions.findIndex(s => s.deviceId === deviceId);
                const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString();
                if(sIdx > -1) {
                    user.sessions[sIdx].socketId = socket.id;
                    user.sessions[sIdx].time = now;
                    user.sessions[sIdx].deviceName = deviceName;
                } else {
                    user.sessions.push({ deviceId, deviceName, socketId: socket.id, time: now });
                }
                await User.updateOne({ username: u }, { socketId: socket.id, sessions: user.sessions });
                const myChats = await Chat.find({ members: u });
                myChats.forEach(c => socket.join(c.username));
            }
        } catch(e){}
    });
    socket.on('typing', async (d) => {
        try {
            const t = await User.findOne({ username: d.to });
            if (t && t.socketId) io.to(t.socketId).emit('is_typing', { from: d.from });
        } catch(e){}
    });
    socket.on('send_msg', async (d) => {
        try {
            const msg = { from: d.from, text: d.text, fileData: d.fileData, videoData: d.videoData, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
            if (d.to.startsWith('@')) {
                const c = await Chat.findOne({ username: d.to });
                if (c && !c.mutes.includes(d.from)) io.to(d.to).emit('new_msg', { ...msg, to: d.to });
            } else {
                const t = await User.findOne({ username: d.to });
                if (t && t.socketId) io.to(t.socketId).emit('new_msg', { ...msg, to: d.to });
            }
        } catch(e){}
    });
    socket.on('action', async (d) => {
        try {
            const c = await Chat.findOne({ username: d.chat });
            if (c && c.admins.includes(d.admin)) {
                if (d.type === 'kick') c.members = c.members.filter(m => m !== d.user);
                if (d.type === 'mute' && !c.mutes.includes(d.user)) c.mutes.push(d.user);
                if (d.type === 'pin') c.pinnedMessage = d.message;
                await c.save();
                io.to(d.chat).emit('chat_update', c);
            }
        } catch(e){}
    });
    socket.on('call_user', async (d) => {
        try {
            const t = await User.findOne({ username: d.to });
            if (t && t.socketId) io.to(t.socketId).emit('call_made', { offer: d.offer, from: d.from });
        } catch(e){}
    });
    socket.on('make_answer', async (d) => {
        try {
            const t = await User.findOne({ username: d.to });
            if (t && t.socketId) io.to(t.socketId).emit('answer_made', { answer: d.answer, from: d.from });
        } catch(e){}
    });
    socket.on('ice_candidate', async (d) => {
        try {
            const t = await User.findOne({ username: d.to });
            if (t && t.socketId) io.to(t.socketId).emit('ice_candidate', { candidate: d.candidate, from: d.from });
        } catch(e){}
    });
    socket.on('end_call', async (d) => {
        try {
            const t = await User.findOne({ username: d.to });
            if (t && t.socketId) io.to(t.socketId).emit('call_ended');
        } catch(e){}
    });
    socket.on('disconnect', async () => {
        try { await User.findOneAndUpdate({ socketId: socket.id }, { socketId: null }); } catch(e){}
    });
});

app.use(express.static(__dirname));

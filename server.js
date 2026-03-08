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

mongoose.connect(MONGO_URI).catch(() => {});

const User = mongoose.model('User', new mongoose.Schema({
    name: String, username: { type: String, unique: true },
    password: { type: String }, socketId: String, avatarColor: String, avatarUrl: String, isGold: { type: Boolean, default: true },
    sessions: { type: Array, default: [] },
    settings: { hideData: { type: Boolean, default: false }, notifications: { type: Boolean, default: true }, ringtone: { type: String, default: 'default' } }
}));

const Chat = mongoose.model('Chat', new mongoose.Schema({
    title: String, username: { type: String, unique: true }, type: String,
    owner: String, admins: [String], members: [String], mutes: [String], pinnedMessage: Object
}));

const Message = mongoose.model('Message', new mongoose.Schema({
    chatId: String, from: String, to: String, text: String, fileData: String, videoData: String, time: String, timestamp: { type: Date, default: Date.now }
}));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/api/ping', (req, res) => res.send('ok'));

app.post('/api/register', async (req, res) => {
    const { name, username, password } = req.body;
    try {
        let user = await User.findOne({ username });
        if (user) return res.status(400).send("Error");
        user = new User({ name, username, password, avatarColor: '#'+Math.floor(Math.random()*16777215).toString(16) });
        await user.save();
        res.json({ success: true, user });
    } catch (e) { res.status(500).send("Error"); }
});

app.post('/api/login', async (req, res) => {
    const { login, password } = req.body;
    try {
        const user = await User.findOne({ username: login, password });
        if (user) res.json({ success: true, user });
        else res.status(401).send("Error");
    } catch(e) { res.status(500).send("Error"); }
});

app.post('/api/chat/create', async (req, res) => {
    const { title, username, type, owner } = req.body;
    try {
        const chat = new Chat({ title, username: '@' + username.replace('@',''), type, owner, admins: [owner], members: [owner] });
        await chat.save();
        res.json(chat);
    } catch (e) { res.status(500).send("Error"); }
});

app.get('/api/search', async (req, res) => {
    try {
        const q = req.query.q;
        const users = await User.find({ username: { $regex: q, $options: 'i' } }).limit(5);
        const chats = await Chat.find({ username: { $regex: q, $options: 'i' } }).limit(5);
        res.json({ users, chats });
    } catch(e) { res.json({ users: [], chats: [] }); }
});

app.post('/api/messages', async (req, res) => {
    try {
        const { from, to } = req.body;
        const chatId = to.startsWith('@') ? to : [from, to].sort().join('_');
        const msgs = await Message.find({ chatId }).sort({ timestamp: 1 });
        res.json(msgs);
    } catch (e) { res.json([]); }
});

app.post('/api/user/status', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.body.username });
        res.json({ online: user && user.sessions.length > 0 });
    } catch(e) { res.json({ online: false }); }
});

app.post('/api/user/update', async (req, res) => {
    try {
        const user = await User.findOneAndUpdate({ username: req.body.username }, { settings: req.body.settings }, { new: true });
        res.json(user);
    } catch (e) { res.status(500).send("Error"); }
});

app.post('/api/user/avatar', async (req, res) => {
    try {
        const user = await User.findOneAndUpdate({ username: req.body.username }, { avatarUrl: req.body.avatarUrl }, { new: true });
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
            if (target && target.socketId) io.to(target.socketId).emit('force_logout');
            user.sessions = user.sessions.filter(s => s.deviceId !== req.body.deviceId);
            await user.save();
            res.json({ success: true });
        }
    } catch(e) { res.status(500).send("Error"); }
});

const socketUserMap = {};

io.on('connection', (socket) => {
    socket.on('identify', async (d) => { 
        try { 
            const user = await User.findOne({ username: d.username });
            if(user) {
                socketUserMap[socket.id] = { username: d.username, deviceId: d.deviceId };
                let sIdx = user.sessions.findIndex(s => s.deviceId === d.deviceId);
                const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString();
                if(sIdx > -1) {
                    user.sessions[sIdx].socketId = socket.id;
                    user.sessions[sIdx].time = now;
                    user.sessions[sIdx].deviceName = d.deviceName;
                } else {
                    user.sessions.push({ deviceId: d.deviceId, deviceName: d.deviceName, socketId: socket.id, time: now });
                }
                await User.updateOne({ username: d.username }, { sessions: user.sessions });
                socket.join(d.username);
                const myChats = await Chat.find({ members: d.username });
                myChats.forEach(c => socket.join(c.username));
            }
        } catch(e){}
    });
    
    socket.on('join_chat', async (d) => {
        try {
            const c = await Chat.findOne({ username: d.chat });
            if (c && !c.members.includes(d.username)) {
                c.members.push(d.username);
                await c.save();
                socket.join(c.username);
                io.to(d.username).emit('joined_success', c);
            }
        } catch(e){}
    });

    socket.on('typing', async (d) => {
        try { io.to(d.to).emit('is_typing', { from: d.from }); } catch(e){}
    });

    socket.on('send_msg', async (d) => {
        try {
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const chatId = d.to.startsWith('@') ? d.to : [d.from, d.to].sort().join('_');
            const newMsg = new Message({ chatId, from: d.from, to: d.to, text: d.text, fileData: d.fileData, videoData: d.videoData, time });
            await newMsg.save();
            const msgObj = { from: d.from, to: d.to, text: d.text, fileData: d.fileData, videoData: d.videoData, time };
            if (d.to.startsWith('@')) {
                const c = await Chat.findOne({ username: d.to });
                if (c && !c.mutes.includes(d.from)) io.to(d.to).emit('new_msg', msgObj);
            } else {
                io.to(d.to).emit('new_msg', msgObj);
                io.to(d.from).emit('new_msg', msgObj);
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
        try { io.to(d.to).emit('call_made', { offer: d.offer, from: d.from }); } catch(e){}
    });
    socket.on('make_answer', async (d) => {
        try { io.to(d.to).emit('answer_made', { answer: d.answer, from: d.from }); } catch(e){}
    });
    socket.on('ice_candidate', async (d) => {
        try { io.to(d.to).emit('ice_candidate', { candidate: d.candidate, from: d.from }); } catch(e){}
    });
    socket.on('end_call', async (d) => {
        try { io.to(d.to).emit('call_ended'); } catch(e){}
    });

    socket.on('disconnect', async () => {
        try {
            const data = socketUserMap[socket.id];
            if(data) {
                const user = await User.findOne({ username: data.username });
                if(user) {
                    user.sessions = user.sessions.filter(s => s.socketId !== socket.id);
                    await user.save();
                }
                delete socketUserMap[socket.id];
            }
        } catch(e){}
    });
});

server.listen(PORT, '0.0.0.0', () => {});
app.use(express.static(__dirname));

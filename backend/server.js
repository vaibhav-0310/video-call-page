require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3000;

// Store user states
const userStates = new Map();

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  
  // Initialize user state
  userStates.set(socket.id, {
    videoEnabled: true,
    audioEnabled: true
  });

  socket.on("message", (message) => {
    // Append sender ID to every message
    message.from = socket.id;
    
    // Handle state updates
    const userState = userStates.get(socket.id);
    if (userState) {
      switch (message.type) {
        case "video-toggle":
          userState.videoEnabled = message.enabled;
          userStates.set(socket.id, userState);
          break;
        case "audio-toggle":
          userState.audioEnabled = message.enabled;
          userStates.set(socket.id, userState);
          break;
      }
    }
    
    // Broadcast message to other clients (not back to sender)
    socket.broadcast.emit("message", message);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    // Clean up user state
    userStates.delete(socket.id);
    
    // Notify other clients that this user left
    socket.broadcast.emit("message", { 
      type: "bye", 
      from: socket.id 
    });
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Internal Server Error");
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
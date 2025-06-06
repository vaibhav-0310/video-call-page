import { io } from "socket.io-client";
import { useRef, useEffect, useState } from "react";
import { FiVideo, FiVideoOff, FiMic, FiMicOff } from "react-icons/fi";

const configuration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
};

const socket = io("http://localhost:3000", { transports: ["websocket"] });

let pc = null;
let localStream = null;

function App() {
  const startButton = useRef(null);
  const hangupButton = useRef(null);
  const muteAudButton = useRef(null);
  const muteVidButton = useRef(null);
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const [audiostate, setAudio] = useState(true);
  const [videostate, setVideo] = useState(true);

  useEffect(() => {
    hangupButton.current.disabled = true;
    muteAudButton.current.disabled = true;
    muteVidButton.current.disabled = true;

    socket.on("message", async (e) => {
      if (!localStream) return;

      // Prevent reacting to your own messages
      if (e.from === socket.id) return;

      switch (e.type) {
        case "offer":
          await handleOffer(e);
          break;
        case "answer":
          await handleAnswer(e);
          break;
        case "candidate":
          await handleCandidate(e);
          break;
        case "ready":
          if (!pc) makeCall();
          break;
        case "bye":
          hangup();
          break;
        case "video-toggle":
          // Handle remote user's video toggle
          handleRemoteVideoToggle(e.enabled);
          break;
        case "audio-toggle":
          // Handle remote user's audio toggle
          handleRemoteAudioToggle(e.enabled);
          break;
        default:
          console.log("Unhandled message:", e);
      }
    });

    return () => {
      socket.off("message");
    };
  }, []);

  function handleRemoteVideoToggle(enabled) {
    // This affects the remote video display
    if (remoteVideo.current && remoteVideo.current.srcObject) {
      const videoTracks = remoteVideo.current.srcObject.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  function handleRemoteAudioToggle(enabled) {
    // This affects the remote audio
    if (remoteVideo.current && remoteVideo.current.srcObject) {
      const audioTracks = remoteVideo.current.srcObject.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  async function makeCall() {
    pc = new RTCPeerConnection(configuration);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("message", {
          type: "candidate",
          candidate: e.candidate,
        });
      }
    };

    pc.ontrack = (e) => {
      remoteVideo.current.srcObject = e.streams[0];
    };

    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("message", { type: "offer", sdp: offer.sdp });
  }

  async function handleOffer(offer) {
    if (pc) return;

    pc = new RTCPeerConnection(configuration);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("message", {
          type: "candidate",
          candidate: e.candidate,
        });
      }
    };

    pc.ontrack = (e) => {
      remoteVideo.current.srcObject = e.streams[0];
    };

    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("message", { type: "answer", sdp: answer.sdp });
  }

  async function handleAnswer(answer) {
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async function handleCandidate(data) {
    if (!pc) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (e) {
      console.error("Invalid ICE candidate", e);
    }
  }

  function hangup() {
    if (pc) {
      pc.close();
      pc = null;
    }

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }

    localVideo.current.srcObject = null;
    remoteVideo.current.srcObject = null;

    startButton.current.disabled = false;
    hangupButton.current.disabled = true;
    muteAudButton.current.disabled = true;
    muteVidButton.current.disabled = true;
    
    // Reset states
    setAudio(true);
    setVideo(true);
  }

  const startB = async () => {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localVideo.current.srcObject = localStream;
      localVideo.current.muted = true;
      startButton.current.disabled = true;
      hangupButton.current.disabled = false;
      muteAudButton.current.disabled = false;
      muteVidButton.current.disabled = false;

      socket.emit("message", { type: "ready" });
    } catch (err) {
      console.log("Error accessing media devices.", err);
    }
  };

  const hangB = () => {
    hangup();
    socket.emit("message", { type: "bye", from: socket.id });
  };

  function muteAudio() {
    if (!localStream) return;
    const enabled = !audiostate;
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
    setAudio(enabled);
    
    // Notify the remote user about audio toggle
    socket.emit("message", { 
      type: "audio-toggle", 
      enabled: enabled 
    });
  }

  function muteVideo() {
    if (!localStream) return;
    const enabled = !videostate;
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
    });
    setVideo(enabled);
    
    // Notify the remote user about video toggle
    socket.emit("message", { 
      type: "video-toggle", 
      enabled: enabled 
    });
  }

  return (
    <main className="container">
      <div className="video bg-main">
        <video ref={localVideo} className="video-item" autoPlay playsInline />
        <video ref={remoteVideo} className="video-item" autoPlay playsInline />
      </div>

      <div className="btn">
        <button ref={startButton} className="btn-item btn-start" onClick={startB}>
          <FiVideo />
        </button>
        <button ref={hangupButton} className="btn-item btn-end" onClick={hangB}>
          <FiVideoOff />
        </button>
        <button ref={muteAudButton} className="btn-item btn-start" onClick={muteAudio}>
          {audiostate ? <FiMic /> : <FiMicOff />}
        </button>
        <button ref={muteVidButton} className="btn-item btn-start" onClick={muteVideo}>
          {videostate ? <FiVideo /> : <FiVideoOff />}
        </button>
      </div>
    </main>
  );
}

export default App;
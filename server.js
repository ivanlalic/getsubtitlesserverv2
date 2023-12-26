const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(cors());

app.get('/', (req, res) => {
  res.send('GetSubtitles Server running');
});

// Endpoint to handle POST requests for subtitles
app.post('/get-subtitles', async (req, res) => {
  const { audio_url } = req.body;
  const gladiaKey = "b2640069-4ce6-41bf-a551-53b4d4d9da14";
  const callbackUrl = "https://getsubtitlesserverv2.onrender.com/webhook"; // Update with your Render URL

  try {
    // Make a POST request to the Gladia API
    const response = await axios.post(
      'https://api.gladia.io/v2/transcription/',
      {
        audio_url,
        callback_url: callbackUrl,
        subtitles: true,
        subtitles_config: {
          formats: ["srt", "vtt"]
        }
      },
      {
        headers: {
          'accept': 'application/json',
          'x-gladia-key': gladiaKey,
          'Content-Type': 'application/json',
        },
      }
    );

    // Send the Gladia API response to the client via WebSocket
    sendWebhookResponse(response.data);

    // Send the Gladia API response to the client via HTTP
    res.json(response.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Function to send WebSocket messages to all connected clients
function sendWebhookResponse(data) {
  wss.clients.forEach((socket) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  });
}

// Endpoint to handle incoming webhook notifications
app.post('/webhook', (req, res) => {
  // Handle the webhook response here

  // Send the webhook response to the client via WebSocket
  sendWebhookResponse(req.body);

  console.log('Webhook Notification Received:', req.body);
  res.status(200).send('Webhook Notification Received');
});

wss.on('connection', (socket) => {
  // Handle new WebSocket connections here
  console.log('WebSocket client connected');

  // Listen for messages from clients (if needed)
  socket.on('message', (message) => {
    console.log('Received message from client:', message);
  });

  // Handle WebSocket disconnections
  socket.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

server.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

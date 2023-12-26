const express = require('express');
const axios = require('axios');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// Enable CORS for WebSocket
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/', (req, res) => {
  res.send('GetSubtitles Server running');
});

// Create an HTTP server
const server = http.createServer(app);

// Create a WebSocket server attached to the HTTP server
const wss = new WebSocket.Server({ server });

// WebSocket connection handling
wss.on('connection', (socket) => {
  console.log('WebSocket connected');

  // You can handle WebSocket messages here if needed
  socket.on('message', (message) => {
    console.log('WebSocket message received:', message);
  });

  // You can handle WebSocket disconnections here if needed
  socket.on('close', () => {
    console.log('WebSocket disconnected');
  });
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

    // Send the Gladia API response to the client
    res.json(response.data);

    // Send the response also through WebSocket
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(response.data));
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint to handle incoming webhook notifications
app.post('/webhook', (req, res) => {
  // Handle the webhook response here
  console.log('Webhook Notification Received:', req.body);
  res.status(200).send('Webhook Notification Received');
});

// Start the server
server.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

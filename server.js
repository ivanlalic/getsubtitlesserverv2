const express = require('express');
const axios = require('axios');
const cors = require('cors');
const WebSocket = require('ws');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

const server = app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

// Create a WebSocket server
const wss = new WebSocket.Server({ noServer: true });

// Upgrade HTTP server to support WebSocket
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Handle incoming WebSocket connections
wss.on('connection', (ws) => {
  console.log('WebSocket connection opened');

  // Send a welcome message to the client
  ws.send('WebSocket connection opened');
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
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(response.data));
      }
    });

    // Send a response to the original HTTP request
    res.json(response.data);
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint to handle incoming webhook notifications
app.post('/webhook', (req, res) => {
  // Handle the webhook response here
  console.log('Webhook Notification Received:', req.body);

  // Send the webhook response to all connected clients via WebSocket
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(req.body));
    }
  });

  res.status(200).send('Webhook Notification Received');
});
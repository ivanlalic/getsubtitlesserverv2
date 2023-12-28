const express = require('express');
const axios = require('axios');
const cors = require('cors');
const FormData = require('form-data');
const fs = require('fs');

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
  const { audio_url, videoFile } = req.body;
  const gladiaKey = "b2640069-4ce6-41bf-a551-53b4d4d9da14";
  const callbackUrl = "https://getsubtitlesserverv2.onrender.com/webhook"; // Update with your Render URL

  try {
    let audioUrl = audio_url;

    // If a video file is provided, upload it to Gladia and get the audio URL
    if (videoFile) {
      const form = new FormData();
      form.append('audio', fs.createReadStream(videoFile.path));

      const uploadResponse = await axios.post('https://api.gladia.io/v2/upload/', form, {
        headers: {
          'accept': 'application/json',
          'x-gladia-key': gladiaKey,
          ...form.getHeaders(),
        },
      });

      audioUrl = uploadResponse.data.audio_url;

      // Cleanup the temporary video file
      fs.unlink(videoFile.path, (err) => {
        if (err) {
          console.error('Error deleting temporary video file:', err);
        } else {
          console.log('Temporary video file deleted successfully');
        }
      });
    }

    // Make a POST request to the Gladia API for transcription
    const transcriptionResponse = await axios.post(
      'https://api.gladia.io/v2/transcription/',
      {
        audio_url: audioUrl,
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

    // Send the transcription response to the client via WebSocket
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(transcriptionResponse.data));
      }
    });

    // Send a response to the original HTTP request
    res.json(transcriptionResponse.data);
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

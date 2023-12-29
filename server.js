const express = require('express');
const axios = require('axios');
const cors = require('cors');
const FormData = require('form-data');
const fs = require('fs');
const multer = require('multer');
const WebSocket = require('ws');
const http = require('http');
const cron = require('node-cron');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

cron.schedule('*/12 * * * *', async () => {
  console.log('Ping server to prevent sleep');
  try {
      // Use axios to send a GET request to your server
      await axios.get('https://getsubtitlesserverv2.onrender.com');
  } catch (error) {
      console.error('Error pinging server:', error.message);
  }
});

const storage = multer.memoryStorage(); // Use memory storage for file uploads
const upload = multer({ storage: storage });

const server = app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  console.log('WebSocket connection opened');
  ws.send('WebSocket connection opened');
});

app.post('/get-subtitles', upload.single('audio'), async (req, res) => {
  const { audio_url } = req.body;
  console.log('Received audio_url:', audio_url);

  const gladiaKey = "b2640069-4ce6-41bf-a551-53b4d4d9da14";
  const callbackUrl = "https://getsubtitlesserverv2.onrender.com/webhook";

  try {
    let audioUrl = audio_url;

    if (req.file) {
      const form = new FormData();
      form.append('audio', req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });

      const uploadResponse = await axios.post('https://api.gladia.io/v2/upload/', form, {
        headers: {
          'accept': 'application/json',
          'x-gladia-key': gladiaKey,
          ...form.getHeaders(),
        },
      });

      audioUrl = uploadResponse.data.audio_url;

      // No need to cleanup since it's in-memory storage
    }

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

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(transcriptionResponse.data));
      }
    });

    res.json(transcriptionResponse.data);
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/webhook', (req, res) => {
  console.log('Webhook Notification Received:', req.body);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(req.body));
    }
  });

  res.status(200).send('Webhook Notification Received');
});

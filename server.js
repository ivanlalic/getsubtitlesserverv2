const express = require('express');
const axios = require('axios');
const cors = require('cors');
const FormData = require('form-data');
const fs = require('fs');
const WebSocket = require('ws');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const corsOptions = {
  origin: 'http://localhost:5500',  // Replace this with the actual origin of your frontend
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));


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

app.post('/get-subtitles', async (req, res) => {
  const { audio_url, videoFile } = req.body;
  const gladiaKey = "b2640069-4ce6-41bf-a551-53b4d4d9da14";
  const callbackUrl = "https://getsubtitlesserverv2.onrender.com/webhook";

  try {
    let audioUrl;

    if (audio_url) {
      // If the user shared an URL
      audioUrl = audio_url;
    } else if (videoFile) {
      // If the user uploaded a video file
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

      fs.unlink(videoFile.path, (err) => {
        if (err) {
          console.error('Error deleting temporary video file:', err);
        } else {
          console.log('Temporary video file deleted successfully');
        }
      });
    } else {
      throw new Error('Either audio_url or videoFile must be provided.');
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

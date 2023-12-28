const express = require('express');
const axios = require('axios');
const cors = require('cors');
const FormData = require('form-data');
const fs = require('fs');
const multer = require('multer');
const WebSocket = require('ws');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

const storage = multer.memoryStorage(); // Use memory storage for file uploads
const upload = multer({ storage: storage });

const server = app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

// WebSocket setup
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('WebSocket connection opened');
  ws.send('WebSocket connection opened');
});

// File path to store the data
const dataFilePath = 'data.json';

// Function to read data from the file
const readDataFromFile = () => {
  try {
    const data = fs.readFileSync(dataFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If the file doesn't exist yet, return an empty object
    return {};
  }
};

// Function to write data to the file
const writeDataToFile = (data) => {
  fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf8');
};

// Function to update and save the data
const updateAndSaveData = (audioDuration, billingTime) => {
  // Read existing data from the file
  const existingData = readDataFromFile();

  // Create or update keys in the data object
  existingData.totalAudioDuration = (existingData.totalAudioDuration || 0) + audioDuration;
  existingData.totalBillingTime = (existingData.totalBillingTime || 0) + billingTime;

  // Save the updated data to the file
  writeDataToFile(existingData);

  // Return the updated data
  return existingData;
};

// Handle POST requests to /get-subtitles
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

    // Extract relevant metadata from the Gladia API response
    const audioDuration = transcriptionResponse.data.payload.metadata.audio_duration;
    const billingTime = transcriptionResponse.data.payload.metadata.billing_time;

    // Update and save the cumulative data
    const updatedData = updateAndSaveData(audioDuration, billingTime);

    // Send the updated data in the response
    res.json({
      ...transcriptionResponse.data,
      cumulativeData: updatedData,
    });
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Handle POST requests to /webhook
app.post('/webhook', (req, res) => {
  console.log('Webhook Notification Received:', req.body);

  // Broadcast the webhook data to all WebSocket clients
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(req.body));
    }
  });

  res.status(200).send('Webhook Notification Received');
});

// Add this route to serve the cumulative data
app.get('/data', (req, res) => {
  try {
    const data = fs.readFileSync(dataFilePath, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Error reading data file:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

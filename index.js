require('dotenv').config();
const express = require('express');
const path = require('path');

const cors = require('cors');

const app = express();
const port = 3000;

const phoneToUserTable = {};

const { tokenGenerate } = require('@vonage/jwt')

const fs = require('fs');

const appId = process.env.API_APPLICATION_ID;
let privateKey;

if (process.env.PRIVATE_KEY) {
  try {
    privateKey = fs.readFileSync(process.env.PRIVATE_KEY, 'utf8');
  } catch (error) {
    // PRIVATE_KEY entered as a single line string
    privateKey = process.env.PRIVATE_KEY.replace(/\\n/g, '\n');
  }
} else if (process.env.PRIVATE_KEY64) {
  privateKey = Buffer.from(process.env.PRIVATE_KEY64, 'base64');
}

if (!appId || !privateKey) {
  console.error('=========================================================================================================');
  console.error('');
  console.error('Missing Vonage Application ID and/or Vonage Private key');
  console.error('Find the appropriate values for these by logging into your Vonage Dashboard at: https://dashboard.nexmo.com/applications');
  console.error('Then add them to ', path.resolve('.env'), 'or as environment variables');
  console.error('');
  console.error('=========================================================================================================');
  process.exit();
}

const { Vonage } = require('@vonage/server-sdk');
const vonageCredentials = {
  applicationId: appId,
  privateKey: privateKey
};
const vonage = new Vonage(vonageCredentials);

// Serve static files from the 'pages' directory
app.use(express.static(path.join(__dirname, 'pages')))

app.use(express.static('static'));
app.use(express.json());

app.use(cors());

app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'pages/index.html'));
});

async function createUser(displayName) {
  const username = displayName.toLowerCase().replaceAll(" ", "-");
  try {
    await vonage.users.createUser({
      'name': username,
      'displayName': displayName,
    });
    return username;
  } catch (error) {
    // User already exists, proceed with existing username
    return username;
  }
}

app.get('/token', async (req, res) => {
  const displayName = req.query.name;
  const phoneNumber = req.query.phone;

  if (!displayName || !phoneNumber) {
    return res.status(400).json({ error: 'Name and phone query parameters are required' });
  }

  const username = await createUser(displayName);
  console.log(`Generating token for user: ${username}, routing number: ${phoneNumber}`);
  
  phoneToUserTable[phoneNumber] = username;

  const aclPaths = {
    "paths": {
      "/*/rtc/**": {},
      "/*/sessions/**": {},
      "/*/conversations/**": {},
      "/*/knocking/**": {},
      "/*/legs/**": {},
    }
  }
  const token = tokenGenerate(appId, privateKey, {
    //expire in 24 hours
    exp: Math.round(new Date().getTime() / 1000) + 86400,
    sub: username,
    acl: aclPaths,
  });

  res.json({ 
    token: token,
    vonageNumber: process.env.VONAGE_PHONE_NUMBER
  });
});

app.get('/voice/answer', (req, res) => {
  console.log('NCCO request:', req.query);
  
  if (req.query.from && !req.query.from_user) {
    const callerNumber = req.query.from;
    const targetUser = phoneToUserTable[callerNumber];

    if (!targetUser) {
      console.log(`Unregistered number ${callerNumber} attempted to call.`);
      return res.json([
        {
          "action": "talk",
          "text": "Welcome to Vonatello's Pizzeria. We don't recognize your phone number. Please log in to the web dashboard first to connect your phone.",
          "provider": "google",
          "providerOptions": {
            "name": "it-IT-Chirp3-HD-Enceladus",
            "language_code": "it-IT"
          }
        }
      ]);
    }

    console.log(`Routing inbound call from ${callerNumber} to app user: ${targetUser}`);
    return res.json([
      {
        "action": "talk",
        "text": "Thanks for calling Vonatello's Pizzeria. Please wait while we connect you so you can order.",
        "provider": "google",
        "providerOptions": {
          "name": "it-IT-Chirp3-HD-Enceladus",
          "language_code": "it-IT"
        }
      },
      {
        "action": "connect",
        "from": callerNumber,
        "endpoint": [
          { type: "app", user: targetUser }
        ]
      }
    ]);
  }
});

app.get('/logout', (req, res) => {
  const phoneNumber = req.query.phone;
  
  if (phoneNumber && phoneToUserTable[phoneNumber]) {
    const user = phoneToUserTable[phoneNumber];
    delete phoneToUserTable[phoneNumber];
    console.log(`Logged out: Removed ${phoneNumber} (User: ${user}) from routing table.`);
  }
  
  res.json({ success: true });
});

app.all('/voice/event', (req, res) => {
  console.log('EVENT:');
  console.dir(req.body);
  console.log('---');
  res.sendStatus(200);
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
